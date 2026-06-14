"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type DemandCell = {
  key: string;
  lat: number;
  lng: number;
  region: string | null;
  demandWeight: number;
  waitlistCount: number;
  callCount: number;
  topCategory: string | null;
  covered: boolean;
};

export type CoveragePoint = {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  region?: string | null;
};

export type Layers = { demand: boolean; clinics: boolean; camps: boolean };

/** Pans/zooms to a selected cell when it changes. */
function FlyToSelected({ cell }: { cell: DemandCell | null }) {
  const map = useMap();
  useEffect(() => {
    if (cell) map.flyTo([cell.lat, cell.lng], Math.max(map.getZoom(), 11), {
      duration: 0.6,
    });
  }, [cell, map]);
  return null;
}

export default function MapView({
  cells,
  clinics,
  camps,
  targets,
  layers = { demand: true, clinics: true, camps: true },
  selectedKey,
  onSelect,
}: {
  cells: DemandCell[];
  clinics: CoveragePoint[];
  camps: CoveragePoint[];
  targets: DemandCell[];
  layers?: Layers;
  selectedKey?: string | null;
  onSelect?: (cell: DemandCell) => void;
}) {
  const allLat = [...cells, ...clinics, ...camps].map((c) => c.lat);
  const allLng = [...cells, ...clinics, ...camps].map((c) => c.lng);
  const center: [number, number] =
    allLat.length > 0
      ? [
          allLat.reduce((a, b) => a + b, 0) / allLat.length,
          allLng.reduce((a, b) => a + b, 0) / allLng.length,
        ]
      : [26.5, 80.5];

  const maxWeight = Math.max(1, ...cells.map((c) => c.demandWeight));
  const targetKeys = new Set(targets.map((t) => t.key));
  const selectedCell = cells.find((c) => c.key === selectedKey) ?? null;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={9}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", borderRadius: "1rem" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToSelected cell={selectedCell} />

        {layers.demand &&
          cells.map((cell) => {
            const intensity = cell.demandWeight / maxWeight;
            const isTarget = targetKeys.has(cell.key);
            const isSelected = cell.key === selectedKey;
            const color = cell.covered
              ? "#2f7d7b"
              : isTarget
                ? "#c33b3b"
                : "#b5436b";
            return (
              <CircleMarker
                key={cell.key}
                center={[cell.lat, cell.lng]}
                radius={10 + intensity * 22}
                eventHandlers={{ click: () => onSelect?.(cell) }}
                pathOptions={{
                  color: isSelected ? "#2a2320" : color,
                  fillColor: color,
                  fillOpacity: 0.25 + intensity * 0.35,
                  weight: isSelected ? 4 : isTarget ? 3 : 1,
                }}
              >
                <Tooltip>
                  <div className="text-xs">
                    <strong>{cell.region ?? "Area"}</strong>
                    <br />
                    Demand score: {cell.demandWeight}
                    <br />
                    Waitlisted: {cell.waitlistCount} · Calls: {cell.callCount}
                    <br />
                    {cell.topCategory && (
                      <>
                        Top need: {cell.topCategory}
                        <br />
                      </>
                    )}
                    {cell.covered ? "Covered" : "No nearby coverage"}
                    <br />
                    <em>Click to focus</em>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {layers.clinics &&
          clinics.map((c) => (
            <CircleMarker
              key={`clinic-${c.id}`}
              center={[c.lat, c.lng]}
              radius={7}
              pathOptions={{
                color: "#2f7d7b",
                fillColor: "#fff",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip>
                <div className="text-xs">
                  <strong>{c.name ?? "Clinic"}</strong>
                  <br />
                  Fixed clinic (coverage)
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

        {layers.camps &&
          camps.map((c) => (
            <CircleMarker
              key={`camp-${c.id}`}
              center={[c.lat, c.lng]}
              radius={8}
              pathOptions={{
                color: "#c8761b",
                fillColor: "#c8761b",
                fillOpacity: 0.8,
                weight: 2,
              }}
            >
              <Tooltip>
                <div className="text-xs">
                  <strong>Active mobile camp</strong>
                  <br />
                  {c.region ?? ""}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="absolute bottom-3 left-3 z-[400] bg-[var(--surface)]/95 backdrop-blur rounded-xl border border-[var(--border)] px-3 py-2 text-xs shadow-sm pointer-events-none">
        <div className="font-semibold mb-1 text-[var(--foreground)]">Legend</div>
        <LegendRow color="#c33b3b" label="Recommended camp target" />
        <LegendRow color="#b5436b" label="Uncovered demand" />
        <LegendRow color="#2f7d7b" label="Covered demand" />
        <LegendRow color="#fff" ring="#2f7d7b" label="Fixed clinic" />
        <LegendRow color="#c8761b" label="Active mobile camp" />
        <div className="text-[var(--muted)] mt-1">Circle size = demand volume</div>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  ring,
  label,
}: {
  color: string;
  ring?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 leading-5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{
          background: color,
          boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
        }}
      />
      <span className="text-[var(--muted)]">{label}</span>
    </div>
  );
}
