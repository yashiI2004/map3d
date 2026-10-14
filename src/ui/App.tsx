import { css, keyframes } from "@emotion/react";
import { Space, SpaceEditorSettings } from "../three/Space";
import { IntroScreen } from "../three/IntroScreen";
import { GlobeAreaSelection, GlobeGenerationResult, GlobeSelection, GlobeTransition } from "../three/GlobeTransition";
import { FullscreenModal } from "../components/FullscreenModal";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Column } from "@/components/flex/Column";
import { MapComponent } from "@/components/map/SelectMap";
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadImages } from "@/components/UploadImages";
import { JobStatus } from "@/components/JobStatus";
import {
  Button,
  NextButton,
  PrevButton,
} from "@/components/button/BottomButton";
import { BuildingHeights, Building, GeoFeature } from "@/components/map/Processing";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useAreaStore } from "@/state/areaStore";
import { useActionStore } from "@/state/exportStore";
import { Modal } from "@/components/modal/Modal";
import { TopNav } from "@/components/nav/TopNav";
import { getCookie } from "@/utils/cookie";
import { Row } from "@/components/flex/Row";
import instanceFleet from "@/api/axios";

const IconSize = css({
  width: "14px",
  height: "14px",
});

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

type SelectedBounds = {
  north: number;
  east: number;
  south: number;
  west: number;
};

function toSelectedBounds(data: any[]): SelectedBounds {
  const first = data[0];
  const second = data[1];
  return {
    north: Math.max(first.lat, second.lat),
    east: Math.max(first.lng, second.lng),
    south: Math.min(first.lat, second.lat),
    west: Math.min(first.lng, second.lng),
  };
}

function App() {
  const [isNextButtonDisabled, setIsNextButtonDisabled] = useState(true);
  const [areaData, setAreaData] = useState([]);
  const [steps, setSteps] = useState(["front", "processing"]);
  const [step, setStep] = useState(0);
  const [isWarnModal, setIsWarnModal] = useState(false);
  const [isExportModal, setIsExportModal] = useState(false);
  const [isFleetLogin, setIsFleetLogin] = useState(false);
  const [isFleetModal, setIsFleetModal] = useState(false);
  const [spaceList, setSpaceList] = useState([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isFetchingBuildings, setIsFetchingBuildings] = useState(false);
  const [hasFetchedBuildings, setHasFetchedBuildings] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [, setJobStatus] = useState<string | null>(null);
  const [detailedStatus, setDetailedStatus] = useState<any | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showGlobeExplorer, setShowGlobeExplorer] = useState(false);
  const [showGeneratedTerrain, setShowGeneratedTerrain] = useState(false);
  const [showLegacyTerrain, setShowLegacyTerrain] = useState(false);
  const [fitModelVersion, setFitModelVersion] = useState(0);
  const [editorSettings, setEditorSettings] = useState<SpaceEditorSettings>({
    showTerrain: true,
    showBuildings: true,
    showRoads: true,
    showWater: true,
    showLandCover: true,
    showTrees: true,
    terrainExaggeration: 1,
    buildingScale: 1,
    baseThickness: 12,
  });
  const [isTransitioningFromIntro, setIsTransitioningFromIntro] = useState(false);
  const [debugData, setDebugData] = useState<{
    bounds: SelectedBounds;
    featureCount: number;
    buildingCount: number;
    roadCount: number;
    treeCount: number;
    extent: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
    modelCenter: { lat: number; lon: number };
  } | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });

  const setCenter = useAreaStore((state) => state.setCenter);
  const setFeatures = useAreaStore((state) => state.setFeatures);
  const appendAreas = useAreaStore((state) => state.appendAreas);
  const setAction = useActionStore((state) => state.setAction);
  const setFleet = useActionStore((state) => state.setFleet);

  const checkIsBig = () => {
    const a = areaData[0].lat - areaData[1].lat;
    const b = areaData[0].lng - areaData[1].lng;

    console.log(a + b);

    if (a + b > 0.1) {
      return true;
    } else {
      return false;
    }
  };

  const handleEnterFromIntro = () => {
    setIsTransitioningFromIntro(true);
    setTimeout(() => {
      setShowIntro(false);
      setShowGlobeExplorer(true);
    }, 1000);
  };

  const handleGlobeSelection = useCallback(({ lat, lng }: GlobeSelection) => {
    const delta = 0.01;
    const selectedBounds = [
      { lat: lat + delta, lng: lng + delta },
      { lat: lat - delta, lng: lng - delta },
    ];
    setAreaData(selectedBounds);
    setCenter(selectedBounds);
    setIsNextButtonDisabled(false);
    setBuildings([]);
    appendAreas([]);
    setFeatures([]);
    setDebugData(null);
    setHasFetchedBuildings(false);
  }, [appendAreas, setCenter, setFeatures]);

  const openLegacyTerrain = () => {
    setShowGlobeExplorer(false);
    setShowLegacyTerrain(true);
  };

  const exportFile = () => {
    setAction(true);
  };

  const exportFleet = () => {
    setAction(true);
  };

  const getFleetSpaces = async () => {
    const getSpace: any = await instanceFleet.get("space");

    setSpaceList([
      ...getSpace.data.spaces.map((item) => {
        return {
          ...item,
          key: item.id,
        };
      }),
    ]);
  };

  const putGlbOnFleetSpace = (spaceId) => {
    setFleet(spaceId, "fleet");
    setTimeout(() => {
      exportFleet();
    }, 100);
  };

  const loadFleetSpace = () => {
    getFleetSpaces();
    setIsFleetModal(true);
  };

  const checkFleetLogin = () => {
    try {
      const isCookie = getCookie("token");
      if (isCookie) {
        setIsFleetLogin(true);
      }
    } catch (error) {}
  };

  const handleDone = (data) => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
    setAreaData(data);
    setCenter(data);
    const bounds = toSelectedBounds(data);
    console.log("SELECTED LOCATION", {
      latitude: (bounds.north + bounds.south) / 2,
      longitude: (bounds.east + bounds.west) / 2,
    });
    console.log("SELECTED BOUNDING BOX", bounds);
    setIsNextButtonDisabled(false);
    setBuildings([]);
    appendAreas([]);
    setFeatures([]);
    setDebugData(null);
    setHasFetchedBuildings(false);
  };

  const handleRemove = () => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    appendAreas([]);
    setFeatures([]);
    setDebugData(null);
    setHasFetchedBuildings(false);
  };

  const requestBuildings = async (boundsOverride?: SelectedBounds): Promise<GlobeGenerationResult | null> => {
    const selectedBounds = boundsOverride || toSelectedBounds(areaData);
    const latitudeKm = Math.abs(selectedBounds.north - selectedBounds.south) * 111.32;
    const longitudeKm = Math.abs(selectedBounds.east - selectedBounds.west) * 111.32 *
      Math.cos(((selectedBounds.north + selectedBounds.south) / 2) * Math.PI / 180);
    if (latitudeKm * longitudeKm > 100) {
      throw new Error("Selected area is too large for the existing TerraVision generator. Select an area under 100 km².");
    }
    if (boundsOverride) {
      const normalizedArea = [
        { lat: selectedBounds.north, lng: selectedBounds.east },
        { lat: selectedBounds.south, lng: selectedBounds.west },
      ];
      setAreaData(normalizedArea);
      setCenter(normalizedArea);
    }
    const requestId = requestRef.current.id + 1;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    requestRef.current = { id: requestId, controller };
    setIsFetchingBuildings(true);

    const { south, west, north, east } = selectedBounds;
    const query = `[out:json][timeout:40];(way["building"](${south},${west},${north},${east});relation["building"](${south},${west},${north},${east});way["highway"](${south},${west},${north},${east});way["leisure"~"park|garden|nature_reserve"](${south},${west},${north},${east});way["landuse"~"forest|wood|grass|orchard|recreation_ground"](${south},${west},${north},${east});way["natural"~"wood|water|tree_row"](${south},${west},${north},${east});way["waterway"](${south},${west},${north},${east});node["natural"="tree"](${south},${west},${north},${east}););out body geom;`;
    console.log("OVERPASS BOUNDING BOX", selectedBounds);
    console.log("OVERPASS QUERY", query);
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Building and geographic data request failed (${response.status}). Try a smaller area or retry.`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        throw new Error("Building and geographic data service returned a non-JSON response. Try again shortly.");
      }
      const data = await response.json();
      if (requestRef.current.id !== requestId) return;
      const isInsideBounds = (point) =>
        point.lat >= south && point.lat <= north && point.lon >= west && point.lon <= east;
      const boundedElements = data.elements.filter((element) => {
        const points = element.geometry || (element.lat !== undefined && element.lon !== undefined
          ? [{ lat: element.lat, lon: element.lon }]
          : []);
        return points.some(isInsideBounds);
      });
      const coordinates = boundedElements.flatMap((element) =>
        element.geometry?.map((point) => ({ lat: point.lat, lon: point.lon })) ||
        (element.lat !== undefined && element.lon !== undefined ? [{ lat: element.lat, lon: element.lon }] : [])
      );
      const extent = coordinates.length
        ? {
            minLat: Math.min(...coordinates.map((point) => point.lat)),
            maxLat: Math.max(...coordinates.map((point) => point.lat)),
            minLon: Math.min(...coordinates.map((point) => point.lon)),
            maxLon: Math.max(...coordinates.map((point) => point.lon)),
          }
        : null;
      console.log("RETURNED OSM EXTENT", extent);
      const features: GeoFeature[] = boundedElements.map((element) => ({
        id: element.id,
        tags: element.tags,
        featureType: element.tags?.building
          ? "building"
          : element.tags?.highway
            ? "road"
            : element.tags?.natural === "tree"
              ? "tree"
              : element.tags?.natural === "tree_row"
                ? "tree"
              : element.tags?.natural === "water" || element.tags?.waterway
                ? "water"
                : "green",
        geometry: element.geometry
          ? element.geometry.map((pt) => ({ lat: pt.lat, lng: pt.lon }))
          : element.lat !== undefined && element.lon !== undefined
            ? [{ lat: element.lat, lng: element.lon }]
            : undefined,
      }));
      const blds: Building[] = features.filter((feature) => feature.featureType === "building");
      setDebugData({
        bounds: selectedBounds,
        featureCount: features.length,
        buildingCount: blds.length,
        roadCount: features.filter((feature) => feature.featureType === "road").length,
        treeCount: features.filter((feature) => feature.featureType === "tree").length,
        extent,
        modelCenter: {
          lat: (selectedBounds.north + selectedBounds.south) / 2,
          lon: (selectedBounds.east + selectedBounds.west) / 2,
        },
      });
      setBuildings(blds);
      setFeatures(features);
      appendAreas(blds);
      setHasFetchedBuildings(true);
      return {
        features,
        buildingCount: blds.length,
        featureCount: features.length,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      console.error("Error fetching building data:", error);
      throw error instanceof Error ? error : new Error("Geographic data request failed.");
    } finally {
      if (requestRef.current.id === requestId) setIsFetchingBuildings(false);
    }
  };

  const generateGlobeArea = useCallback(async (area: GlobeAreaSelection): Promise<GlobeGenerationResult> => {
    const result = await requestBuildings(area.bounds);
    if (!result) throw new Error("No geographic data was returned for this area.");
    return result;
  }, [requestBuildings]);

  const handleGlobeGenerationComplete = useCallback(() => {
    setShowGeneratedTerrain(true);
  }, []);

  const handleClickNextStep = async () => {
    if (step == 0) {
      if (uploadedFiles.length > 0) {
        const id = await uploadJob(uploadedFiles);
        if (id) {
          pollJob(id);
        }
      }
      if (checkIsBig()) {
        setIsWarnModal(true);
        return false;
      }
    }
    if (step == 1 && !hasFetchedBuildings) {
      await requestBuildings();
      return;
    }
    setStep(step + 1);
  };

  const handleClickPrevStep = () => {
    setStep(step - 1);
  };

  const handleClickExport = () => {
    setIsExportModal(true);
  };

  async function uploadJob(files: File[]) {
    if (!files || files.length === 0) return null;
    setIsUploadingImages(true);
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    try {
      const resp = await fetch('http://localhost:3000/api/jobs', { method: 'POST', body: fd });
      const json = await resp.json();
      return json.jobId;
    } catch (err) {
      console.error('Upload failed', err);
      return null;
    } finally {
      setIsUploadingImages(false);
    }
  }
  async function pollJob(id: string) {
    setJobId(id);
    setJobStatus('queued');
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/jobs/${id}/status`);
        if (!res.ok) throw new Error('status_failed');
        const j = await res.json();
        setJobStatus(j.status || 'unknown');
        // store the detailed status object for JobStatus component
        setDetailedStatus(j);
        if (j.status === 'failed') {
          clearInterval(poll);
        } else if (j.status === 'finished' || j.status === 'done' || j.status === 'success') {
          clearInterval(poll);
        }
      } catch (err) {
        console.error('poll err', err);
      }
    }, 2000);
  }

  useEffect(() => {
    checkFleetLogin();
  }, []);

  if (showIntro) {
    return <IntroScreen onEnter={handleEnterFromIntro} isTransitioning={isTransitioningFromIntro} />;
  }

  return (
    <div css={css({ height: "100%", width: "100%" })}>
      {showGlobeExplorer && (
        <GlobeTransition
          onSelectionChange={handleGlobeSelection}
          onGenerateArea={generateGlobeArea}
          onGenerationComplete={handleGlobeGenerationComplete}
        />
      )}
      {showGlobeExplorer && showGeneratedTerrain && (
        <div className="globe-explorer__generated-workspace">
          <div className="globe-explorer__generated-header">
            <strong>TerraVision 3D editor</strong>
            <button type="button" onClick={() => setShowGeneratedTerrain(false)}>Hide result</button>
          </div>
          <div className="globe-explorer__editor-controls">
            <label>Terrain <input type="checkbox" checked={editorSettings.showTerrain} onChange={(event) => setEditorSettings((s) => ({ ...s, showTerrain: event.target.checked }))} /></label>
            <label>Buildings <input type="checkbox" checked={editorSettings.showBuildings} onChange={(event) => setEditorSettings((s) => ({ ...s, showBuildings: event.target.checked }))} /></label>
            <label>Roads <input type="checkbox" checked={editorSettings.showRoads} onChange={(event) => setEditorSettings((s) => ({ ...s, showRoads: event.target.checked }))} /></label>
            <label>Water <input type="checkbox" checked={editorSettings.showWater} onChange={(event) => setEditorSettings((s) => ({ ...s, showWater: event.target.checked }))} /></label>
            <label>Land cover <input type="checkbox" checked={editorSettings.showLandCover} onChange={(event) => setEditorSettings((s) => ({ ...s, showLandCover: event.target.checked }))} /></label>
            <label>Trees <input type="checkbox" checked={editorSettings.showTrees} onChange={(event) => setEditorSettings((s) => ({ ...s, showTrees: event.target.checked }))} /></label>
            <label>Terrain exaggeration
              <input type="range" min="0.5" max="4" step="0.1" value={editorSettings.terrainExaggeration} onChange={(event) => setEditorSettings((s) => ({ ...s, terrainExaggeration: Number(event.target.value) }))} />
              {editorSettings.terrainExaggeration.toFixed(1)}x
            </label>
            <label>Building height
              <input type="range" min="0.5" max="2.5" step="0.1" value={editorSettings.buildingScale} onChange={(event) => setEditorSettings((s) => ({ ...s, buildingScale: Number(event.target.value) }))} />
              {editorSettings.buildingScale.toFixed(1)}x
            </label>
            <label>Base thickness
              <input type="range" min="4" max="80" step="1" value={editorSettings.baseThickness} onChange={(event) => setEditorSettings((s) => ({ ...s, baseThickness: Number(event.target.value) }))} />
              {editorSettings.baseThickness}m
            </label>
            <span>Shape: rectangular</span>
            <button type="button" onClick={() => setFitModelVersion((version) => version + 1)}>Fit model</button>
            <button type="button" onClick={() => setAction(true)}>Export GLB</button>
          </div>
          <Space step={2} editorSettings={editorSettings} fitVersion={fitModelVersion} />
        </div>
      )}
      {showLegacyTerrain && <TopNav step={step} />}
      <JobStatus jobId={jobId} statusData={detailedStatus} />

      {showLegacyTerrain && <FullscreenModal isOpen={steps[step] == "front"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>Generate 3d map</Title>
            <Description>
              Tools to create 3D maps based on maps and export them in GLB
              format
            </Description>
          </Column>
          <MapComponent
            onRemove={handleRemove}
            onDone={handleDone}
          ></MapComponent>

          <div
            css={css({
              marginTop: "0.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid rgba(0, 0, 0, 0.08)",
            })}
          >
            <Column gap="0.5rem">
              <div css={css({ fontWeight: 600, fontSize: "14px", color: "#5b5d63" })}>
                Add Map Image (Optional)
              </div>
              <Description>
                Upload photos of the area. This is optional - you can still
                select the location on the map and continue as usual.
              </Description>
              <UploadImages onSelect={(files) => setUploadedFiles(files)} />
              {uploadedFiles.length > 0 && (
                <div css={css({ color: "#6b7280", fontSize: "12px" })}>
                  {isUploadingImages
                    ? "Uploading selected images..."
                    : `${uploadedFiles.length} image${uploadedFiles.length === 1 ? "" : "s"} selected. They will be uploaded when you click Next Step.`}
                </div>
              )}
            </Column>
          </div>
        </Column>
      </FullscreenModal>}

      {showLegacyTerrain && <FullscreenModal isOpen={steps[step] == "processing"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>Processing</Title>
            <Description>
              Click Next Step to fetch building information. Once loaded, click
              Next Step again to view the 3D scene.
            </Description>

            <BuildingHeights
              buildings={buildings}
              loading={isFetchingBuildings}
            />
            {import.meta.env.DEV && debugData && (
              <div css={css({ fontSize: "11px", color: "#374151", lineHeight: 1.5 })}>
                <strong>Selected area diagnostics</strong><br />
                Lat: {((debugData.bounds.north + debugData.bounds.south) / 2).toFixed(6)} | Lon: {((debugData.bounds.east + debugData.bounds.west) / 2).toFixed(6)}<br />
                BBox: S {debugData.bounds.south.toFixed(6)}, W {debugData.bounds.west.toFixed(6)}, N {debugData.bounds.north.toFixed(6)}, E {debugData.bounds.east.toFixed(6)}<br />
                OSM features: {debugData.featureCount} | Buildings: {debugData.buildingCount} | Roads: {debugData.roadCount} | Trees: {debugData.treeCount}<br />
                Data extent: {debugData.extent ? `${debugData.extent.minLat.toFixed(6)} to ${debugData.extent.maxLat.toFixed(6)}, ${debugData.extent.minLon.toFixed(6)} to ${debugData.extent.maxLon.toFixed(6)}` : "none"}
                <br />Model center: {debugData.modelCenter.lat.toFixed(6)}, {debugData.modelCenter.lon.toFixed(6)}
              </div>
            )}
          </Column>
        </Column>
      </FullscreenModal>}

      {showLegacyTerrain && <PrevButton isShow={step != 0} onClick={handleClickPrevStep}>
        <ChevronLeft css={IconSize} /> Prev Step
      </PrevButton>}

      {showLegacyTerrain && <NextButton
        isShow={step != 2}
        disabled={isNextButtonDisabled || isFetchingBuildings}
        onClick={handleClickNextStep}
      >
        {isFetchingBuildings ? (
          <>
            <Loader2
              css={[
                IconSize,
                css({ animation: `${spinAnimation} 1s linear infinite` }),
              ]}
            />
            Fetching...
          </>
        ) : (
          <>
            Next Step <ChevronRight css={IconSize} />
          </>
        )}
      </NextButton>}

      {showLegacyTerrain && <NextButton isShow={step == 2} onClick={handleClickExport}>
        Export GLB <Download css={IconSize} />
      </NextButton>}

      {showLegacyTerrain && <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <Column gap="0.5rem">
          <Title>The area is too big </Title>
          <Description>Do you want to proceed?</Description>
          <Button
            isShow={step != 2}
            disabled={isNextButtonDisabled}
            onClick={() => {
              setStep(step + 1);
              setIsWarnModal(false);
            }}
          >
            Next Step <ChevronRight css={IconSize} />
          </Button>
        </Column>
      </Modal>}

      {showLegacyTerrain && <Modal isOpen={isExportModal} onClose={() => setIsExportModal(false)}>
        <Column gap="0.5rem">
          <Title>Export</Title>

          <Row gap="0.5rem">
            <Button isShow={true} onClick={exportFile}>
              GLB Download <Download css={IconSize} />
            </Button>

            {/* {isFleetLogin ? (
              <Button isShow={true} onClick={loadFleetSpace}>
                Fleet Interlock
              </Button>
            ) : (
              <Button
                isShow={true}
                onClick={() => window.open("https://fleet.im/auth")}
              >
                Fleet Login
              </Button>
            )} */}
          </Row>
        </Column>
      </Modal>}

      {showLegacyTerrain && <Modal isOpen={isFleetModal} onClose={() => setIsFleetModal(false)}>
        <Column gap="0.5rem">
          <Title>Select Fleet Space</Title>
          {spaceList.map((item, index) => (
            <Button isShow={true} onClick={() => putGlbOnFleetSpace(item.id)}>
              {item.title}
            </Button>
          ))}
        </Column>
      </Modal>}

      {showLegacyTerrain && <Space step={step}></Space>}
    </div>
  );
}

export default App;
