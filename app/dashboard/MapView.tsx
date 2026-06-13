"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
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

export default function MapView({
  cells,
  clinics,
  camps,
  targets,
}: {
  cells: DemandCell[];
  clinics: CoveragePoint[];
  camps: CoveragePoint[];
  targets: DemandCell[];
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

  return (
    <MapContainer
      center={center}
      zoom={9}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "1rem" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {cells.map((cell) => {
        const intensity = cell.demandWeight / maxWeight;
        const isTarget = targetKeys.has(cell.key);
        const color = cell.covered ? "#2f7d7b" : isTarget ? "#c33b3b" : "#b5436b";
        return (
          <CircleMarker
            key={cell.key}
            center={[cell.lat, cell.lng]}
            radius={10 + intensity * 22}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.25 + intensity * 0.35,
              weight: isTarget ? 3 : 1,
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
                {cell.topCategory && <>Top need: {cell.topCategory}<br /></>}
                {cell.covered ? "Covered" : "No nearby coverage"}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {clinics.map((c) => (
        <CircleMarker
          key={`clinic-${c.id}`}
          center={[c.lat, c.lng]}
          radius={7}
          pathOptions={{ color: "#2f7d7b", fillColor: "#fff", fillOpacity: 1, weight: 3 }}
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

      {camps.map((c) => (
        <CircleMarker
          key={`camp-${c.id}`}
          center={[c.lat, c.lng]}
          radius={8}
          pathOptions={{ color: "#c8761b", fillColor: "#c8761b", fillOpacity: 0.8, weight: 2 }}
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
  );
}
