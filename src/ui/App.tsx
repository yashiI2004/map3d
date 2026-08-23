import { css, keyframes } from "@emotion/react";
import { Space } from "../three/Space";
import { FullscreenModal } from "../components/FullscreenModal";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Column } from "@/components/flex/Column";
import { MapComponent } from "@/components/map/SelectMap";
import { useEffect, useState } from "react";
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
    setAreaData(data);
    setCenter(data);
    console.log(data, "AAEE");
    setIsNextButtonDisabled(false);
    setBuildings([]);
    setFeatures([]);
    setHasFetchedBuildings(false);
  };

  const handleRemove = () => {
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    setHasFetchedBuildings(false);
  };

  const requestBuildings = async () => {
    setIsFetchingBuildings(true);

    const south = areaData[1].lat;
    const west = areaData[1].lng;
    const north = areaData[0].lat;
    const east = areaData[0].lng;
    const query = `[out:json][timeout:40];(way["building"](${south},${west},${north},${east});relation["building"](${south},${west},${north},${east});way["highway"](${south},${west},${north},${east});way["leisure"~"park|garden|nature_reserve"](${south},${west},${north},${east});way["landuse"~"forest|wood|grass|orchard|recreation_ground"](${south},${west},${north},${east});way["natural"~"wood|water|tree_row"](${south},${west},${north},${east});way["waterway"](${south},${west},${north},${east});node["natural"="tree"](${south},${west},${north},${east}););out body geom;`;
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await response.json();
      const features: GeoFeature[] = data.elements.map((element) => ({
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
      setBuildings(blds);
      setFeatures(features);
      appendAreas(blds);
      setHasFetchedBuildings(true);
    } catch (error) {
      console.error("Error fetching building data:", error);
    } finally {
      setIsFetchingBuildings(false);
    }
  };

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

  return (
    <div css={css({ height: "100%", width: "100%" })}>
      <TopNav step={step} />
      <JobStatus jobId={jobId} statusData={detailedStatus} />

      <FullscreenModal isOpen={steps[step] == "front"}>
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
      </FullscreenModal>

      <FullscreenModal isOpen={steps[step] == "processing"}>
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
          </Column>
        </Column>
      </FullscreenModal>

      <PrevButton isShow={step != 0} onClick={handleClickPrevStep}>
        <ChevronLeft css={IconSize} /> Prev Step
      </PrevButton>

      <NextButton
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
      </NextButton>

      <NextButton isShow={step == 2} onClick={handleClickExport}>
        Export GLB <Download css={IconSize} />
      </NextButton>

      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
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
      </Modal>

      <Modal isOpen={isExportModal} onClose={() => setIsExportModal(false)}>
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
      </Modal>

      <Modal isOpen={isFleetModal} onClose={() => setIsFleetModal(false)}>
        <Column gap="0.5rem">
          <Title>Select Fleet Space</Title>
          {spaceList.map((item, index) => (
            <Button isShow={true} onClick={() => putGlbOnFleetSpace(item.id)}>
              {item.title}
            </Button>
          ))}
        </Column>
      </Modal>

      <Space step={step}></Space>
    </div>
  );
}

export default App;
