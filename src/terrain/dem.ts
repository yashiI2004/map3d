export type DEMPoint = {
  lat: number;
  lng: number;
};

export type DEMSample = DEMPoint & {
  elevation: number;
};

type DEMResult = {
  elevation?: number | null;
};

const MAX_ELEVATION_METERS = 9000;
const MIN_ELEVATION_METERS = -500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; samples: DEMSample[] }>();

export const DEFAULT_DEM_ENDPOINT = "https://api.opentopodata.org/v1/aster30m";

export function isValidDEMPoint(point: DEMPoint) {
  return Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180;
}

export function isValidElevation(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_ELEVATION_METERS &&
    value <= MAX_ELEVATION_METERS;
}

function cacheKey(endpoint: string, points: DEMPoint[]) {
  return `${endpoint}|${points.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|")}`;
}

function nearestValidElevation(samples: DEMSample[], point: DEMPoint) {
  let nearest = samples[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  samples.forEach((sample) => {
    const distance = (sample.lat - point.lat) ** 2 + (sample.lng - point.lng) ** 2;
    if (distance < nearestDistance) {
      nearest = sample;
      nearestDistance = distance;
    }
  });
  return nearest?.elevation ?? 0;
}

export function normalizeDEMResults(points: DEMPoint[], results: DEMResult[]): DEMSample[] {
  const valid = results
    .map((result, index) => ({ point: points[index], elevation: result?.elevation }))
    .filter((item): item is { point: DEMPoint; elevation: number } =>
      Boolean(item.point) && isValidDEMPoint(item.point) && isValidElevation(item.elevation)
    )
    .map(({ point, elevation }) => ({ ...point, elevation }));

  if (!valid.length) throw new Error("DEM returned no valid elevation samples.");

  return points
    .filter(isValidDEMPoint)
    .map((point) => ({
      ...point,
      elevation: valid.find((sample) => sample.lat === point.lat && sample.lng === point.lng)?.elevation ??
        nearestValidElevation(valid, point),
    }));
}

export async function fetchDEMSamples(
  points: DEMPoint[],
  signal?: AbortSignal,
  endpoint = import.meta.env.VITE_DEM_ENDPOINT || (import.meta.env.DEV ? "/api/elevation" : DEFAULT_DEM_ENDPOINT),
): Promise<DEMSample[]> {
  const validPoints = points.filter(isValidDEMPoint);
  if (!validPoints.length) throw new Error("DEM request contains no valid geographic points.");

  const key = cacheKey(endpoint, validPoints);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.samples;

  const response = await fetch(`${endpoint}?locations=${encodeURIComponent(validPoints.map((point) => `${point.lat},${point.lng}`).join("|"))}`, { signal });
  if (!response.ok) throw new Error(`DEM provider returned HTTP ${response.status}.`);
  const data = await response.json() as { results?: DEMResult[] };
  if (!Array.isArray(data.results)) throw new Error("DEM provider returned an invalid response.");

  const samples = normalizeDEMResults(validPoints, data.results);
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, samples });
  return samples;
}

export function clearDEMCache() {
  responseCache.clear();
}
