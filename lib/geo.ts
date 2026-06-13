/** Great-circle distance between two points in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Snap a precise coordinate to a coarse grid cell. We never store or surface a
 * patient's exact location; demand is aggregated to ~11km cells (0.1 degree).
 */
export function coarseCell(
  lat: number,
  lng: number,
  precision = 1,
): { lat: number; lng: number; key: string } {
  const factor = 10 ** precision;
  const cLat = Math.round(lat * factor) / factor;
  const cLng = Math.round(lng * factor) / factor;
  return { lat: cLat, lng: cLng, key: `${cLat},${cLng}` };
}
