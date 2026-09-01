/**
 * Solar time engine.
 *
 * Low-precision solar position (Astronomical Almanac approximation,
 * good to ~0.01° for decades around J2000) — no dependencies, pure
 * functions of a Date.
 *
 * Outputs:
 *  - `subsolarPoint`  — where the sun is directly overhead (lat/lon °)
 *  - `sunDirection`   — unit vector toward the sun in the globe frame
 *                       (+Y = north pole, lon 0° = +Z, east positive
 *                       toward +X); the hero mesh is aligned to this
 *                       convention
 *  - `solarPhase`     — normalized local solar time in [0, 1):
 *                       0 = solar midnight, 0.5 = solar noon
 *
 * No geolocation is ever requested: the visitor's longitude is
 * approximated from their UTC offset (15° per hour), which is within
 * ~1 h of true solar time almost everywhere.
 */

const DEG = Math.PI / 180;
const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12); // 2000-01-01T12:00Z

export interface SubsolarPoint {
  /** latitude in degrees, north positive */
  lat: number;
  /** longitude in degrees in [-180, 180), east positive */
  lon: number;
}

export type Vec3 = readonly [number, number, number];

/** Days (fractional) since the J2000 epoch. */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() - J2000_MS) / MS_PER_DAY;
}

function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function wrap180(deg: number): number {
  return wrap360(deg + 180) - 180;
}

interface SolarCoords {
  /** apparent right ascension, degrees */
  ra: number;
  /** declination, degrees */
  dec: number;
  /** mean longitude, degrees (for the equation of time) */
  meanLon: number;
}

function solarCoords(date: Date): SolarCoords {
  const n = daysSinceJ2000(date);
  const L = wrap360(280.46 + 0.9856474 * n); // mean longitude
  const g = wrap360(357.528 + 0.9856003 * n) * DEG; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * DEG; // obliquity

  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG;
  const ra = wrap360(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG);
  return { ra, dec, meanLon: L };
}

/**
 * Equation of time in minutes: apparent solar time minus mean solar
 * time. Ranges roughly −14…+16 min over the year.
 */
export function equationOfTime(date: Date): number {
  const { ra, meanLon } = solarCoords(date);
  return 4 * wrap180(meanLon - ra);
}

/** Point on Earth where the sun is at the zenith. */
export function subsolarPoint(date: Date): SubsolarPoint {
  const { ra, dec } = solarCoords(date);
  const gmst = wrap360(280.46061837 + 360.98564736629 * daysSinceJ2000(date));
  return { lat: dec, lon: wrap180(ra - gmst) };
}

/**
 * Unit vector toward the sun in the globe frame:
 * +Y = north pole, lon 0° = +Z, lon 90°E = +X.
 */
export function sunDirection(date: Date): Vec3 {
  const { lat, lon } = subsolarPoint(date);
  const latR = lat * DEG;
  const lonR = lon * DEG;
  return [
    Math.cos(latR) * Math.sin(lonR),
    Math.sin(latR),
    Math.cos(latR) * Math.cos(lonR),
  ] as const;
}

/**
 * Longitude estimated from a UTC offset (as returned by
 * `Date.prototype.getTimezoneOffset`, minutes, UTC − local).
 */
export function longitudeFromUtcOffset(offsetMinutes: number): number {
  return wrap180(-offsetMinutes / 4);
}

/**
 * Normalized apparent solar time at the given longitude:
 * 0 = solar midnight, 0.5 = solar noon.
 */
export function solarPhase(date: Date, longitudeDeg: number): number {
  const utcFraction = (((date.getTime() % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_DAY;
  const phase = utcFraction + longitudeDeg / 360 + equationOfTime(date) / 1440;
  return ((phase % 1) + 1) % 1;
}

/**
 * The visitor's solar phase, longitude approximated from their UTC
 * offset — never a geolocation prompt.
 */
export function localSolarPhase(date: Date): number {
  return solarPhase(date, longitudeFromUtcOffset(date.getTimezoneOffset()));
}

/** IANA timezone name of the visitor (display only). */
export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
