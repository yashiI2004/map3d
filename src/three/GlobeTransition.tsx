import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export type GlobeSelection = {
  lat: number;
  lng: number;
};

type GlobeExplorerProps = {
  onSelectionChange: (selection: GlobeSelection) => void;
  onOpenLegacyTerrain: () => void;
};

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN as string | undefined;

function formatCoordinate(selection: GlobeSelection | null) {
  if (!selection) return "Click the globe to choose a terrain location";
  return `${selection.lat.toFixed(5)}, ${selection.lng.toFixed(5)}`;
}

export function GlobeTransition({ onSelectionChange, onOpenLegacyTerrain }: GlobeExplorerProps) {
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
  const selectionEntityRef = useRef<Cesium.Entity | null>(null);

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
      new Cesium.WebMapServiceImageryProvider({
        url: import.meta.env.DEV ? "/api/imagery" : "https://tiles.maps.eox.at/wms",
        layers: "s2cloudless-2019",
        parameters: {
          service: "WMS",
          version: "1.1.1",
          request: "GetMap",
          styles: "",
          format: "image/jpeg",
          transparent: false,
        },
      })
    );
    satelliteLayer.alpha = 0.92;
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

  const imageryLabel = imageryStatus === "active"
    ? "Photorealistic 3D"
    : imageryStatus === "loading"
      ? "Loading imagery"
      : imageryStatus === "error"
        ? "Fallback imagery"
        : "Cesium fallback";

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
          <button type="button" className="globe-explorer__enter" onClick={onOpenLegacyTerrain}>
            Open legacy TerraVision tools
          </button>
        </aside>
      )}
      <div className="globe-explorer__hint">Drag to orbit · right-drag to pan/tilt · wheel to zoom</div>
    </div>
  );
}
