export type FeatureSource = "openstreetmap" | "ai_detection" | "photogrammetry" | "manual";

export type SceneFeatureType =
  | "building"
  | "road"
  | "green"
  | "water"
  | "tree"
  | "unknown";

export type FeatureProvenance = {
  source: FeatureSource;
  sourceId?: string;
  modelVersion?: string;
  confidence?: number;
};

export type GeographicCoordinate = {
  lat: number;
  lng: number;
};

export type ValidatedSceneFeature = {
  id: number | string;
  featureType: SceneFeatureType;
  tags: Record<string, string | undefined>;
  geometry?: GeographicCoordinate[];
  provenance: FeatureProvenance;
};

export type CapabilityStatus = "available" | "unavailable" | "planned";

export type AICapability = {
  id: "reconstruction" | "detection" | "terrain" | "scene" | "routing";
  label: string;
  status: CapabilityStatus;
  detail: string;
};

const isFiniteCoordinate = (point: GeographicCoordinate) =>
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  point.lat >= -90 &&
  point.lat <= 90 &&
  point.lng >= -180 &&
  point.lng <= 180;

export function validateSceneFeature(feature: ValidatedSceneFeature): ValidatedSceneFeature | null {
  if (feature.id === "" || feature.id === null || feature.id === undefined) return null;
  if (!feature.provenance?.source || !feature.tags) return null;
  if (feature.provenance.confidence !== undefined &&
    (!Number.isFinite(feature.provenance.confidence) ||
      feature.provenance.confidence < 0 ||
      feature.provenance.confidence > 1)) return null;
  if (feature.geometry && (
    feature.geometry.length === 0 ||
    feature.geometry.some((point) => !isFiniteCoordinate(point))
  )) return null;
  return feature;
}
