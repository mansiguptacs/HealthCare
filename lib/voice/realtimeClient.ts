/**
 * Browser client for the Grok Voice Agent API (OpenAI-Realtime compatible).
 *
 * Audio architecture:
 *  INPUT  – mic → ScriptProcessorNode (fires at AudioContext's native rate,
 *            typically 48kHz) → resample down to 24kHz → base64 PCM16 →
 *            input_audio_buffer.append  (Grok hears correct-speed audio)
 *
 *  OUTPUT – response.audio.delta (base64 PCM16 at 24kHz) → Float32 → Web
 *            AudioBuffer at 24kHz → AudioContext plays & resamples to native
 *            rate automatically (jitter-queue keeps chunks seamless)
 */

import { AGENT_TOOLS, INTAKE_SYSTEM_PROMPT } from "@/lib/agent";

/** xAI Grok Voice API native audio rate. */
const API_RATE = 24000;

export type VoiceEvents = {
  onStatus?: (status: string) => void;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

export class RealtimeVoiceClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  /** Scheduled playback head in AudioContext seconds. */
  private playHead = 0;
  /** How many audio delta events have been received (shown in debug status). */
  private audioChunks = 0;
  private callId: string;
  private events: VoiceEvents;
  private sessionReady = false;
  private sessionReadyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Periodic keep-alive so Chrome never auto-suspends the AudioContext. */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callId: string, events: VoiceEvents) {
    this.callId = callId;
    this.events = events;
  }

  async start() {
    console.log("[voice] start() called for call", this.callId);
    this.events.onStatus?.("Requesting microphone access...");

    // Grab mic early so the permission prompt fires before the WebSocket opens.
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Don't hint a sample rate — let the browser use its native rate (usually
        // 48kHz).  We downsample to API_RATE in startMicCapture() ourselves.
      },
    });

    this.events.onStatus?.("Connecting to Sakhi...");
    const { token, url, model } = await this.mintToken();

    this.audioCtx = new AudioContext();
    if (this.audioCtx.state !== "running") {
      await this.audioCtx.resume();
    }

    // Play a silent buffer every 5 s so Chrome never auto-suspends the context.
    this.keepAliveTimer = setInterval(() => {
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      } else if (this.audioCtx && this.audioCtx.state === "running") {
        const buf = this.audioCtx.createBuffer(1, 1, this.audioCtx.sampleRate);
        const src = this.audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.audioCtx.destination);
        src.start();
      }
    }, 5000);

    // xAI Grok realtime auth: use OpenAI-compatible subprotocol approach.
    // The server authenticates via the "openai-insecure-api-key.{token}" subprotocol,
    // which works for both real ephemeral tokens and raw API keys (fallback).
    const wsUrl = `${url}?model=${encodeURIComponent(model)}`;
    console.log("[voice] connecting to", wsUrl, "| token:", token.slice(0, 8) + "…");

    const ws = new WebSocket(wsUrl, [
      "realtime",
      `openai-insecure-api-key.${token}`,
      "openai-beta.realtime-v1",
    ]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      console.log("[voice] WebSocket open ✓");
      this.events.onStatus?.("Configuring session...");
      this.send({
        type: "session.update",
        session: {
          instructions: INTAKE_SYSTEM_PROMPT,
          voice: "eve",
          turn_detection: {
            type: "server_vad",
            threshold: 0.4,
            prefix_padding_ms: 200,
            silence_duration_ms: 500,
          },
          tools: AGENT_TOOLS,
          tool_choice: "auto",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          modalities: ["text", "audio"],
        },
      });

      // Fallback: if session.updated never arrives (some server versions only
      // send session.created), kick off the session after 3 s anyway.
      this.sessionReadyTimer = setTimeout(() => {
        if (!this.sessionReady) {
          console.warn("[voice] session.updated not received — starting via fallback");
          this.activateSession();
        }
      }, 3000);
    };

    ws.onmessage = (ev) => {
      void this.handleServerEvent(ev.data);
    };
    ws.onerror = (e) => {
      console.error("[voice] WebSocket error", e);
      this.events.onError?.("Voice connection error — check browser console.");
    };
    ws.onclose = (e) => {
      console.log("[voice] WebSocket closed — code:", e.code, "reason:", e.reason, "clean:", e.wasClean);
      this.events.onStatus?.(
        e.wasClean ? "Call ended." : `Disconnected (code ${e.code} — ${e.reason || "no reason"}).`,
      );
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async mintToken() {
    console.log("[voice] minting ephemeral token for call", this.callId);
    const res = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: this.callId }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      console.error("[voice] token mint failed", err);
      throw new Error(err.message ?? "Could not start a voice session.");
    }
    const data = await res.json() as { token: string; url: string; model: string };
    console.log("[voice] token minted ✓, url:", data.url, "model:", data.model, "token:", data.token?.slice(0, 8) + "…");
    return data;
  }

  private activateSession() {
    this.sessionReady = true;
    this.events.onStatus?.("Connected — Sakhi is greeting you...");
    this.startMicCapture();
    // Ask Grok to speak first so the patient hears an immediate warm greeting.
    this.send({ type: "response.create" });
  }

  private startMicCapture() {
    if (!this.audioCtx || !this.micStream) return;

    const ctxRate = this.audioCtx.sampleRate; // e.g. 48000
    const source = this.audioCtx.createMediaStreamSource(this.micStream);
    // Buffer size 4096 gives ~85ms chunks at 48kHz — large enough for stable
    // callbacks without noticeable latency.
    const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const nativeSamples = e.inputBuffer.getChannelData(0);
      // Resample from ctxRate → API_RATE (e.g. 48kHz → 24kHz).
      const resampled = downsample(nativeSamples, ctxRate, API_RATE);
      const pcm = floatToPcm16(resampled);
      this.send({
        type: "input_audio_buffer.append",
        audio: arrayBufferToBase64(pcm.buffer),
      });
    };

    source.connect(processor);
    // Route through a silent gain node to activate the ScriptProcessor without
    // echoing mic audio back through the speakers.
    const silence = this.audioCtx.createGain();
    silence.gain.value = 0;
    processor.connect(silence);
    silence.connect(this.audioCtx.destination);
  }

  private async handleServerEvent(raw: string | ArrayBuffer) {
    if (typeof raw !== "string") {
      console.log("[voice] binary frame", (raw as ArrayBuffer).byteLength, "bytes");
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const type = msg.type as string;
    console.log("[voice] ←", type, msg.response_id ?? msg.item_id ?? "");

    switch (type) {
      // session.created fires immediately on WS open, BEFORE our session.update
      // has been processed.  Do NOT trigger response.create here.
      case "session.created": {
        break;
      }

      // session.updated confirms our config (prompt + tools + modalities) is active.
      case "session.updated": {
        if (!this.sessionReady) {
          if (this.sessionReadyTimer) {
            clearTimeout(this.sessionReadyTimer);
            this.sessionReadyTimer = null;
          }
          this.activateSession();
        }
        break;
      }

      // ── Audio output ────────────────────────────────────────────────────────
      case "response.audio.delta": {
        if (typeof msg.delta === "string" && msg.delta.length > 0) {
          this.audioChunks++;
          this.events.onStatus?.(`Speaking… (chunk ${this.audioChunks})`);
          await this.playPcm16(base64ToArrayBuffer(msg.delta));
        }
        break;
      }

      // Transcript of the audio the model just spoke (streaming deltas).
      case "response.audio_transcript.delta": {
        if (typeof msg.delta === "string" && msg.delta.length > 0) {
          this.events.onAgentTranscript?.(msg.delta);
        }
        break;
      }
      case "response.audio_transcript.done": {
        // Full transcript of one audio turn — use as fallback if deltas didn't fire.
        if (typeof msg.transcript === "string" && msg.transcript.trim()) {
          this.events.onAgentTranscript?.("__FULL__" + msg.transcript.trim());
        }
        this.events.onAgentTranscript?.("\n");
        break;
      }

      // Text-only output delta (fires when modalities includes "text").
      case "response.text.delta": {
        if (typeof msg.delta === "string" && msg.delta.length > 0) {
          this.events.onAgentTranscript?.(msg.delta);
        }
        break;
      }
      case "response.text.done": {
        this.events.onAgentTranscript?.("\n");
        break;
      }

      // Full output item completed — reliable fallback to grab the whole text
      // if delta events were missing or incomplete.
      case "response.output_item.done": {
        const item = msg.item as Record<string, unknown> | undefined;
        if (item?.type === "message") {
          const content = item.content as Array<Record<string, unknown>> | undefined;
          const textPart = content?.find((c) => c.type === "text" || c.type === "audio");
          const text = (textPart?.text ?? textPart?.transcript) as string | undefined;
          if (text?.trim()) {
            this.events.onAgentTranscript?.("__FULL__" + text.trim());
          }
        }
        break;
      }

      // ── User speech ─────────────────────────────────────────────────────────
      case "conversation.item.input_audio_transcription.completed": {
        if (typeof msg.transcript === "string" && msg.transcript.trim()) {
          this.events.onUserTranscript?.(msg.transcript.trim());
        }
        break;
      }

      case "input_audio_buffer.speech_started": {
        this.audioChunks = 0; // reset for next turn
        this.events.onStatus?.("Listening...");
        break;
      }

      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed": {
        this.events.onStatus?.("Thinking...");
        // Explicitly request a response — server_vad should auto-create one,
        // but being explicit guarantees the model always responds after a pause.
        this.send({ type: "response.create" });
        break;
      }

      // ── Response lifecycle ──────────────────────────────────────────────────
      case "response.created":
      case "response.output_item.added": {
        this.events.onStatus?.("Speaking...");
        break;
      }
      case "response.done": {
        // Extract the full spoken text — fires reliably even when xAI doesn't
        // send audio_transcript.delta events during streaming.
        try {
          const response = msg.response as Record<string, unknown> | undefined;
          const output = response?.output as Array<Record<string, unknown>> | undefined;
          if (output?.length) {
            for (const item of output) {
              if (item.type === "message") {
                const content = item.content as Array<Record<string, unknown>> | undefined;
                if (content?.length) {
                  for (const part of content) {
                    // audio parts have a "transcript" field; text parts have "text"
                    const text = (part.transcript ?? part.text) as string | undefined;
                    if (text?.trim()) {
                      console.log("[voice] response.done transcript:", text.slice(0, 120));
                      this.events.onAgentTranscript?.("__FULL__" + text.trim());
                      this.events.onAgentTranscript?.("\n");
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[voice] could not extract transcript from response.done", e);
        }
        this.events.onStatus?.("Listening...");
        break;
      }

      // ── Tool calls ──────────────────────────────────────────────────────────
      case "response.function_call_arguments.done": {
        const name = msg.name as string;
        const toolCallId = msg.call_id as string;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse((msg.arguments as string) || "{}"); } catch { /**/ }

        this.events.onToolCall?.(name, args);
        this.events.onStatus?.(`Running ${name}...`);

        const result = await this.runTool(name, args);
        this.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: toolCallId,
            output: JSON.stringify(result),
          },
        });
        this.send({ type: "response.create" });
        break;
      }

      // ── Errors ──────────────────────────────────────────────────────────────
      case "error": {
        const errMsg = (msg.error as { message?: string })?.message ?? "API error";
        console.error("[voice] server error", msg.error);
        this.events.onError?.(errMsg);
        break;
      }

      default:
        // Log anything we don't handle so we can see every event xAI sends
        console.log("[voice] unhandled event:", type, JSON.stringify(msg).slice(0, 200));
    }
  }

  private async runTool(name: string, args: Record<string, unknown>) {
    const res = await fetch(`/api/calls/${this.callId}/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    return (await res.json().catch(() => ({}))).result ?? { ok: false };
  }

  /**
   * Decode a chunk of base64 PCM16 audio (24kHz, mono) and schedule it for
   * seamless gapless playback using the Web Audio API jitter queue.
   */
  private async playPcm16(buffer: ArrayBuffer) {
    if (!this.audioCtx) return;

    // Ensure the context is running before scheduling — Chrome can auto-suspend.
    if (this.audioCtx.state !== "running") {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn("[voice] AudioContext resume failed", e);
        return;
      }
    }

    if (buffer.byteLength < 2) return; // ignore empty/malformed chunks

    // PCM16 little-endian → Float32 [-1, 1]
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Create an AudioBuffer at API_RATE (24kHz). The Web Audio API will
    // automatically resample it to the AudioContext's native rate on playback.
    const audioBuffer = this.audioCtx.createBuffer(1, float32.length, API_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const src = this.audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;

    // If the playhead has fallen behind currentTime (first chunk, or a long
    // silence), snap it to now + a small jitter buffer (50ms) to avoid
    // scheduling in the past.
    if (this.playHead < now) {
      this.playHead = now + 0.05;
    }

    src.start(this.playHead);
    this.playHead += audioBuffer.duration;
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  stop() {
    if (this.sessionReadyTimer) { clearTimeout(this.sessionReadyTimer); this.sessionReadyTimer = null; }
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
    this.processor?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.ws?.close();
    this.ws = null;
    setTimeout(() => this.audioCtx?.close(), 1500);
  }
}

// ─── Audio math helpers ───────────────────────────────────────────────────────

/**
 * Simple nearest-neighbour downsample.  Good enough for speech (< 12kHz
 * content) and avoids the complexity of a proper anti-alias filter.
 */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = input[Math.round(i * ratio)];
  }
  return out;
}

function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
