import { css } from "@emotion/react";
import { AICapability, CapabilityStatus, ValidatedSceneFeature } from "@/ai/contracts";
import type { ElevationStatus } from "@/three/Space";

type AIToolsPanelProps = {
  features: ValidatedSceneFeature[];
  uploadedImageCount: number;
  elevationStatus: ElevationStatus;
  elevationError?: string;
};

const statusLabel: Record<CapabilityStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  planned: "Planned",
};

function getCapabilities(uploadedImageCount: number, elevationStatus: ElevationStatus, elevationError?: string): AICapability[] {
  return [
    {
      id: "reconstruction",
      label: "Realistic building reconstruction",
      status: uploadedImageCount > 0 ? "planned" : "unavailable",
      detail: uploadedImageCount > 0
        ? "Photos are queued for the existing photogrammetry worker; no AI reconstruction model is configured."
        : "Requires suitable overlapping imagery and a configured reconstruction service.",
    },
    {
      id: "detection",
      label: "AI feature detection",
      status: "unavailable",
      detail: "No georeferenced aerial imagery and segmentation model are configured.",
    },
    {
      id: "terrain",
      label: "Terrain elevation",
      status: elevationStatus === "ready" ? "available" : elevationStatus === "loading" ? "planned" : "unavailable",
      detail: elevationStatus === "ready"
        ? "Real ASTER 30 m DEM samples are aligned to the selected bounds and used by the terrain mesh."
        : elevationStatus === "loading"
          ? "Loading real ASTER 30 m DEM samples; flat-ground fallback remains available."
          : elevationError || "DEM data is unavailable; flat-ground fallback remains active.",
    },
    {
      id: "scene",
      label: "Scene understanding",
      status: "available",
      detail: "Categories are derived from validated OpenStreetMap tags; unsupported classes remain unknown.",
    },
    {
      id: "routing",
      label: "Route planning",
      status: "planned",
      detail: "Road features are loaded, but a connected routing graph and route UI are not implemented yet.",
    },
  ];
}

export function AIToolsPanel({ features, uploadedImageCount, elevationStatus, elevationError }: AIToolsPanelProps) {
  const capabilities = getCapabilities(uploadedImageCount, elevationStatus, elevationError);
  const sourceCounts = features.reduce<Record<string, number>>((counts, feature) => {
    counts[feature.provenance.source] = (counts[feature.provenance.source] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="globe-explorer__ai-panel" aria-label="AI tools status">
      <div className="globe-explorer__control-heading">AI tools and provenance</div>
      <p className="globe-explorer__ai-intro">
        Optional capabilities are reported from configured data sources. No predictions are generated without a validated input.
      </p>
      <div className="globe-explorer__ai-capabilities">
        {capabilities.map((capability) => (
          <div className="globe-explorer__ai-capability" key={capability.id}>
            <div className="globe-explorer__ai-capability-header">
              <strong>{capability.label}</strong>
              <span className={`globe-explorer__ai-status globe-explorer__ai-status--${capability.status}`}>
                {statusLabel[capability.status]}
              </span>
            </div>
            <small>{capability.detail}</small>
          </div>
        ))}
      </div>
      <div className="globe-explorer__ai-source-summary">
        <strong>Current scene sources</strong>
        <span>OpenStreetMap: {sourceCounts.openstreetmap || 0}</span>
        <span>AI detections: {sourceCounts.ai_detection || 0}</span>
        <span>Photogrammetry: {sourceCounts.photogrammetry || 0}</span>
      </div>
    </div>
  );
}
