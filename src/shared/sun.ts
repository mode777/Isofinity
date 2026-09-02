// Sun position from local solar time, dependency-free (shared style with
// iso.ts: pure functions, no DOM).
//
// Basis: NOAA low-precision declination series + hour angle. Time inputs
// are local *solar* time — the sun transits at 12:00 — so the equation of
// time and longitude drop out. Accuracy is well under 1°, plenty for art
// direction; this is not a navigation instrument.
//
// Axis mapping: the runtime panel's azimuth convention is 0° = world +x,
// 90° = world +z (see updateLightUniforms); we fix +x = East, +z = North
// and convert once here, so compass azimuth A maps to panel azimuth
// 90° − A (normalized to [0, 360)). Elevation is degrees above the
// horizon and MAY be negative (sun below horizon) — callers decide how
// to handle night.

const DEG = 180 / Math.PI;

export interface SunPosition {
  azimuthDeg: number;
  elevationDeg: number;
}

export function sunDirection(
  dayOfYear: number,
  hourOfDay: number,
  latitudeDeg: number,
): SunPosition {
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hourOfDay - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const lat = latitudeDeg / DEG;
  const hourAngle = (((hourOfDay - 12) * 15) / DEG);

  // Sun unit vector in local East/North/Up axes.
  const east = -Math.cos(decl) * Math.sin(hourAngle);
  const north =
    Math.cos(lat) * Math.sin(decl) - Math.sin(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const up =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);

  const compassDeg = Math.atan2(east, north) * DEG;
  const elevationDeg = Math.asin(Math.min(1, Math.max(-1, up))) * DEG;
  return { azimuthDeg: normalizeDeg(90 - compassDeg), elevationDeg };
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
