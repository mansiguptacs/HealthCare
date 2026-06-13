/**
 * Browser client for the Grok Voice Agent API (OpenAI-Realtime compatible).
 *
 * Flow: mint an ephemeral token server-side -> open a WebSocket to
 * wss://api.x.ai/v1/realtime -> stream mic audio as PCM16/24kHz -> play back
 * audio deltas -> when Grok requests a tool, run it via our API and return the
 * result. This keeps the real API key on the server at all times.
 *
 * Note: this is best-effort and untested without a live key; the text intake
 * is the guaranteed-working path for demos.
 */

const SAMPLE_RATE = 24000;

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
  private playHead = 0;
  private callId: string;
  private events: VoiceEvents;

  constructor(callId: string, events: VoiceEvents) {
    this.callId = callId;
    this.events = events;
  }

  async start() {
    this.events.onStatus?.("Requesting access...");
    const tokenRes = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: this.callId }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.message ?? "Could not start a voice session.");
    }
    const { token, url, model } = (await tokenRes.json()) as {
      token: string;
      url: string;
      model: string;
    };

    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // The ephemeral token is passed via subprotocols (OpenAI-compatible).
    const ws = new WebSocket(`${url}?model=${encodeURIComponent(model)}`, [
      "realtime",
      `openai-insecure-api-key.${token}`,
    ]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.events.onStatus?.("Connected. Start speaking.");
      this.startMicCapture();
    };
    ws.onmessage = (ev) => this.handleServerEvent(ev.data);
    ws.onerror = () => this.events.onError?.("Voice connection error.");
    ws.onclose = () => this.events.onStatus?.("Call ended.");
  }

  private startMicCapture() {
    if (!this.audioCtx || !this.micStream) return;
    const source = this.audioCtx.createMediaStreamSource(this.micStream);
    const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = floatToPcm16(input);
      this.send({
        type: "input_audio_buffer.append",
        audio: arrayBufferToBase64(pcm.buffer),
      });
    };
    source.connect(processor);
    processor.connect(this.audioCtx.destination);
  }

  private async handleServerEvent(raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const type = msg.type as string;

    if (type === "response.audio.delta" && typeof msg.delta === "string") {
      this.playPcm16(base64ToArrayBuffer(msg.delta));
    } else if (
      type === "response.audio_transcript.delta" &&
      typeof msg.delta === "string"
    ) {
      this.events.onAgentTranscript?.(msg.delta);
    } else if (
      type === "conversation.item.input_audio_transcription.completed" &&
      typeof msg.transcript === "string"
    ) {
      this.events.onUserTranscript?.(msg.transcript);
    } else if (type === "response.function_call_arguments.done") {
      const name = msg.name as string;
      const callId = msg.call_id as string;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse((msg.arguments as string) || "{}");
      } catch {
        args = {};
      }
      this.events.onToolCall?.(name, args);
      const result = await this.runTool(name, args);
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      });
      this.send({ type: "response.create" });
    } else if (type === "error") {
      this.events.onError?.(
        (msg.error as { message?: string })?.message ?? "Voice error",
      );
    }
  }

  private async runTool(name: string, args: Record<string, unknown>) {
    const res = await fetch(`/api/calls/${this.callId}/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    const data = await res.json().catch(() => ({}));
    return data.result ?? { ok: false };
  }

  private playPcm16(buffer: ArrayBuffer) {
    if (!this.audioCtx) return;
    const int16 = new Int16Array(buffer);
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;
    const audioBuffer = this.audioCtx.createBuffer(1, float.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(float, 0);
    const src = this.audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.audioCtx.destination);
    const now = this.audioCtx.currentTime;
    this.playHead = Math.max(this.playHead, now);
    src.start(this.playHead);
    this.playHead += audioBuffer.duration;
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  stop() {
    this.processor?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.audioCtx?.close();
    this.ws?.close();
    this.ws = null;
  }
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
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
