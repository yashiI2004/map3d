import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export type GlobeSelection = {
  lat: number;
  lng: number;
};

export type GeographicPoint = GlobeSelection;

export type GlobeAreaSelection = {
  type: "rectangle" | "polygon";
  points: GeographicPoint[];
  bounds: { north: number; east: number; south: number; west: number };
  center: GeographicPoint;
  areaSquareMeters: number;
};

export type GlobeGenerationResult = {
  features: Array<{
    id: number;
    featureType: string;
    tags?: Record<string, string | undefined>;
    geometry?: GeographicPoint[];
  }>;
  buildingCount: number;
  featureCount: number;
};

type GlobeExplorerProps = {
  onSelectionChange: (selection: GlobeSelection) => void;
  onGenerateArea: (area: GlobeAreaSelection) => Promise<GlobeGenerationResult>;
  onGenerationComplete: () => void;
};

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN as string | undefined;

function formatCoordinate(selection: GlobeSelection | null) {
  if (!selection) return "Click the globe to choose a terrain location";
  return `${selection.lat.toFixed(5)}, ${selection.lng.toFixed(5)}`;
}

function calculateArea(points: GeographicPoint[]) {
  if (points.length < 3) return 0;
  const centerLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(Cesium.Math.toRadians(centerLat));
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point.lng * lngScale) * (next.lat * latScale) -
      (next.lng * lngScale) * (point.lat * latScale);
  }, 0) / 2);
}

function boundsFor(points: GeographicPoint[]) {
  return {
    north: Math.max(...points.map((point) => point.lat)),
    east: Math.max(...points.map((point) => point.lng)),
    south: Math.min(...points.map((point) => point.lat)),
    west: Math.min(...points.map((point) => point.lng)),
  };
}

function centerFor(points: GeographicPoint[]): GeographicPoint {
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  };
}

export function GlobeTransition({ onSelectionChange, onGenerateArea, onGenerationComplete }: GlobeExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const [selection, setSelection] = useState<GlobeSelection | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Explore the globe, then click a location to select it.");
  const [isSearching, setIsSearching] = useState(false);
  const [imageryStatus, setImageryStatus] = useState<"fallback" | "loading" | "active" | "error">(
    GOOGLE_KEY ? "loading" : "fallback"
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"none" | "rectangle" | "polygon">("none");
  const [areaSelection, setAreaSelection] = useState<GlobeAreaSelection | null>(null);
  const [draftPoints, setDraftPoints] = useState<GeographicPoint[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GlobeGenerationResult | null>(null);
  const selectionEntityRef = useRef<Cesium.Entity | null>(null);
  const areaEntitiesRef = useRef<Cesium.Entity[]>([]);
  const generatedEntitiesRef = useRef<Cesium.Entity[]>([]);
  const dragStartRef = useRef<GeographicPoint | null>(null);
  const drawingRef = useRef(false);
  const selectionModeRef = useRef<"none" | "rectangle" | "polygon">("none");
  const polygonPointsRef = useRef<GeographicPoint[]>([]);

  const pickPoint = (position: Cesium.Cartesian2) => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const ray = viewer.camera.getPickRay(position);
    const fallback = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid) ||
      (ray ? viewer.scene.globe.pick(ray, viewer.scene) : null);
    if (!fallback) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(fallback);
    return {
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      lng: Cesium.Math.toDegrees(cartographic.longitude),
    };
  };

  const clearAreaEntities = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    areaEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    areaEntitiesRef.current = [];
  };

  const renderArea = (points: GeographicPoint[]) => {
    const viewer = viewerRef.current;
    if (!viewer || points.length < 2) return;
    clearAreaEntities();
    const positions = points.map((point) => Cesium.Cartesian3.fromDegrees(point.lng, point.lat));
    const boundary = viewer.entities.add({
      polyline: {
        positions: [...positions, positions[0]],
        width: 3,
        material: Cesium.Color.CYAN,
        clampToGround: true,
      },
    });
    areaEntitiesRef.current.push(boundary);
    if (points.length >= 3) {
      const fill = viewer.entities.add({
        polygon: {
          hierarchy: positions,
          material: Cesium.Color.CYAN.withAlpha(0.2),
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      areaEntitiesRef.current.push(fill);
    }
  };

  const finishArea = (type: "rectangle" | "polygon", points: GeographicPoint[]) => {
    if ((type === "rectangle" && points.length !== 4) || (type === "polygon" && points.length < 3)) {
      setMessage(type === "polygon" ? "Add at least three points to finish the polygon." : "Drag across the globe to define a rectangle.");
      return;
    }
    const area: GlobeAreaSelection = {
      type,
      points,
      bounds: boundsFor(points),
      center: centerFor(points),
      areaSquareMeters: calculateArea(points),
    };

    setAreaSelection(area);
    setSelection(area.center);
    setDraftPoints([]);
    setSelectionMode("none");
    drawingRef.current = false;
    viewerRef.current?.scene.screenSpaceCameraController && (viewerRef.current.scene.screenSpaceCameraController.enableInputs = true);
    renderArea(points);
    onSelectionChange(area.center);
    setDetailsOpen(true);
    setMessage("Area selected. Review the bounds, then generate the 3D result.");
  };

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (CESIUM_ION_TOKEN) Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: true,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: true,
      timeline: false,
      vrButton: false,
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Promise.resolve(new Cesium.OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        }))
      ),
      ...(CESIUM_ION_TOKEN
        ? { terrain: Cesium.Terrain.fromWorldTerrain() }
        : { terrainProvider: new Cesium.EllipsoidTerrainProvider() }),
    });
    const satelliteLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
        credit: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      })
    );
    satelliteLayer.alpha = 1;
    satelliteLayer.show = true;
    const labelsLayer = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
        credit: "Esri",
      })
    );
    labelsLayer.alpha = 0.92;
    labelsLayer.brightness = 1.2;

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5;
    viewer.scene.globe.tileCacheSize = 1000;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.requestRenderMode = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 2;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
    viewer.scene.screenSpaceCameraController.minimumCollisionTerrainHeight = 0;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.88;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.88;
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0.86;
    viewer.scene.screenSpaceCameraController.minimumPickingTerrainHeight = 0;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(78, 20, 18000000),
    });
    viewerRef.current = viewer;

    if (GOOGLE_KEY) {
      Cesium.createGooglePhotorealistic3DTileset({ key: GOOGLE_KEY })
        .then((tileset) => {
          viewer.scene.primitives.add(tileset);
          tileset.tileVisible.addEventListener(() => {
            viewer.scene.globe.show = false;
            setImageryStatus("active");
          });
          tileset.tileFailed.addEventListener((error) => {
            console.error("Google Photorealistic 3D Tile request failed:", error);
            setImageryStatus("error");
            setMessage("Photorealistic imagery is unavailable here; Cesium fallback imagery remains active.");
          });
        })
        .catch((error) => {
          console.error("Google Photorealistic 3D Tiles failed to load:", error);
          setImageryStatus("error");
          setMessage("Photorealistic imagery could not be loaded; Cesium fallback imagery remains active.");
        });
    }

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (selectionModeRef.current !== "rectangle") return;
      dragStartRef.current = pickPoint(movement.position);
      drawingRef.current = Boolean(dragStartRef.current);
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (selectionModeRef.current === "polygon") {
        const point = pickPoint(movement.position);
        if (point) {
          polygonPointsRef.current = [...polygonPointsRef.current, point];
          setDraftPoints(polygonPointsRef.current);
          renderArea(polygonPointsRef.current);
        }
        return;
      }
      if (selectionModeRef.current === "rectangle") return;
      const picked = viewer.scene.pick(movement.position);
      const cartesian = picked instanceof Cesium.Cesium3DTileFeature
        ? viewer.scene.pickPosition(movement.position)
        : viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) {
        setMessage("That point could not be selected. Try clicking visible terrain.");
        return;
      }
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const nextSelection = {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lng: Cesium.Math.toDegrees(cartographic.longitude),
      };
      setSelection(nextSelection);
      onSelectionChange(nextSelection);
      if (selectionEntityRef.current) viewer.entities.remove(selectionEntityRef.current);
      selectionEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          Math.max(cartographic.height, 0)
        ),
        point: {
          pixelSize: 12,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      setMessage("Location selected. Continue exploring or keep navigating.");
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (selectionModeRef.current !== "rectangle" || !drawingRef.current) return;
      const start = dragStartRef.current;
      const end = pickPoint(movement.endPosition);
      if (!start || !end) return;
      const points = [
        { lat: start.lat, lng: start.lng },
        { lat: start.lat, lng: end.lng },
        { lat: end.lat, lng: end.lng },
        { lat: end.lat, lng: start.lng },
      ];
      setDraftPoints(points);
      renderArea(points);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (selectionModeRef.current !== "rectangle" || !drawingRef.current) return;
      const start = dragStartRef.current;
      const end = pickPoint(movement.position);
      drawingRef.current = false;
      if (!start || !end) return;
      finishArea("rectangle", [
        { lat: start.lat, lng: start.lng },
        { lat: start.lat, lng: end.lng },
        { lat: end.lat, lng: end.lng },
        { lat: end.lat, lng: start.lng },
      ]);
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
    handlerRef.current = handler;

    return () => {
      handler.destroy();
      handlerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onSelectionChange]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query || !viewerRef.current) return;
    setIsSearching(true);
    setMessage("Searching for location...");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { "Accept-Language": "en" } }
      );
      if (!response.ok) throw new Error(`Search failed with ${response.status}`);
      const result = (await response.json())?.[0];
      if (!result) {
        setMessage("No matching location found.");
        return;
      }
      const nextSelection = { lat: Number(result.lat), lng: Number(result.lon) };
      setSelection(nextSelection);
      onSelectionChange(nextSelection);
      const resultHeight = Number(result.boundingbox?.[1]) - Number(result.boundingbox?.[0]);
      const altitude = Number.isFinite(resultHeight)
        ? Math.max(1200, Math.min(12000, resultHeight * 180000))
        : 4500;
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(nextSelection.lng, nextSelection.lat, altitude),
        duration: 2,
      });
      if (selectionEntityRef.current) viewerRef.current.entities.remove(selectionEntityRef.current);
      selectionEntityRef.current = viewerRef.current.entities.add({
        position: Cesium.Cartesian3.fromDegrees(nextSelection.lng, nextSelection.lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      setMessage(`Showing ${result.display_name}. Location selected.`);
    } catch (error) {
      console.error("Globe location search failed:", error);
      setMessage("Location search is unavailable right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const beginAreaSelection = (mode: "rectangle" | "polygon") => {
    clearAreaEntities();
    setAreaSelection(null);
    setGenerationResult(null);
    polygonPointsRef.current = [];
    setDraftPoints([]);
    selectionModeRef.current = mode;
    setSelectionMode(mode);
    drawingRef.current = false;
    if (viewerRef.current) viewerRef.current.scene.screenSpaceCameraController.enableInputs = false;
    setMessage(mode === "rectangle"
      ? "Drag across the globe to select a rectangle."
      : "Click boundary points, then choose Finish polygon.");
  };

  const cancelAreaSelection = () => {
    polygonPointsRef.current = [];
    dragStartRef.current = null;
    drawingRef.current = false;
    setDraftPoints([]);
    selectionModeRef.current = "none";
    setSelectionMode("none");
    clearAreaEntities();
    if (viewerRef.current) viewerRef.current.scene.screenSpaceCameraController.enableInputs = true;
    setMessage("Area selection cancelled.");
  };

  const clearAreaSelection = () => {
    cancelAreaSelection();
    setAreaSelection(null);
    generatedEntitiesRef.current.forEach((entity) => viewerRef.current?.entities.remove(entity));
    generatedEntitiesRef.current = [];
    setGenerationResult(null);
  };

  const finishPolygon = () => {
    finishArea("polygon", polygonPointsRef.current);
  };

  const generateArea = async () => {
    if (!areaSelection) return;
    setIsGenerating(true);
    setMessage("Fetching elevation and OpenStreetMap features...");
    try {
      const result = await onGenerateArea(areaSelection);
      setGenerationResult(result);
      onGenerationComplete();
      setDetailsOpen(true);
      setMessage(`Generated ${result.featureCount} geographic features (${result.buildingCount} buildings).`);
    } catch (error) {
      console.error("TerraVision area generation failed:", error);
      setMessage(error instanceof Error ? error.message : "3D generation failed. Try a smaller area.");
    } finally {
      setIsGenerating(false);
    }
  };

  const imageryLabel = imageryStatus === "active"
    ? "Photorealistic 3D"
    : imageryStatus === "loading"
      ? "Loading imagery"
      : imageryStatus === "error"
        ? "Fallback imagery"
        : "Satellite fallback";

  return (
    <div className="globe-explorer">
      <div ref={containerRef} className="globe-explorer__viewer" />
      <div className="globe-explorer__toolbar">
        <div className="globe-explorer__brand">TerraVision</div>
        <form onSubmit={handleSearch} className="globe-explorer__search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a country, city, or street"
            aria-label="Search geographic location"
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? "…" : "Search"}
          </button>
        </form>
        <span className="globe-explorer__imagery-status" title={message}>{imageryLabel}</span>
        <button type="button" className="globe-explorer__details-button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
          {detailsOpen ? "Close" : "Details"}
        </button>
      </div>
      {detailsOpen && (
        <aside className="globe-explorer__details">
          <div className="globe-explorer__eyebrow">Globe explorer</div>
          <p>{message}</p>
          <div className="globe-explorer__selection">
            <span>Selected location</span>
            <strong>{formatCoordinate(selection)}</strong>
          </div>
          {!GOOGLE_KEY && <small>Set VITE_GOOGLE_MAPS_API_KEY in a local .env file for Google Photorealistic 3D Tiles. The Cesium globe remains usable without it.</small>}
        </aside>
      )}
      <div className="globe-explorer__area-tools">
        <button type="button" onClick={() => beginAreaSelection("rectangle")} disabled={isGenerating}>Select rectangle</button>
        <button type="button" onClick={() => beginAreaSelection("polygon")} disabled={isGenerating}>Select polygon</button>
        {selectionMode === "polygon" && <button type="button" onClick={finishPolygon}>Finish polygon</button>}
        {selectionMode !== "none" && <button type="button" onClick={cancelAreaSelection}>Cancel</button>}
        {areaSelection && <button type="button" onClick={clearAreaSelection}>Clear</button>}
      </div>
      {areaSelection && (
        <aside className="globe-explorer__area-review">
          <div className="globe-explorer__eyebrow">Selected {areaSelection.type}</div>
          <div>Centre: {formatCoordinate(areaSelection.center)}</div>
          <div>Bounds: S {areaSelection.bounds.south.toFixed(5)}, W {areaSelection.bounds.west.toFixed(5)}, N {areaSelection.bounds.north.toFixed(5)}, E {areaSelection.bounds.east.toFixed(5)}</div>
          <div>Area: {areaSelection.areaSquareMeters >= 1_000_000
            ? `${(areaSelection.areaSquareMeters / 1_000_000).toFixed(2)} km²`
            : `${Math.round(areaSelection.areaSquareMeters).toLocaleString()} m²`}</div>
          <div className="globe-explorer__data-status">
            Imagery: {imageryLabel}<br />
            Elevation: {generationResult ? "loaded by existing terrain renderer" : "loaded by existing terrain renderer"}<br />
            Buildings: {generationResult ? `${generationResult.buildingCount} returned by Overpass` : "not fetched"}
          </div>
          <button type="button" className="globe-explorer__generate" onClick={generateArea} disabled={isGenerating}>
            {isGenerating ? "Generating…" : "Generate 3D"}
          </button>
          {generationResult && <small>The existing TerraVision terrain and building renderer is now available in the workspace below. No GLB export is required for this workflow.</small>}
        </aside>
      )}
      <div className="globe-explorer__hint">Drag to orbit · right-drag to pan/tilt · wheel to zoom</div>
    </div>
  );
}
