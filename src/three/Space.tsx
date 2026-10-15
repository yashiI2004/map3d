import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, extend, ReactThreeFiber, useFrame, useThree } from "@react-three/fiber";
import { Soldier, useAreaStore } from "@/state/areaStore";
import { Html, Sky, Environment, Line, Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useActionStore } from "@/state/exportStore";
import { GLTFExporter } from "three/examples/jsm/Addons.js";
import Car from "./Car";
import { useCarStore } from "@/state/carStore";
import instanceFleet from "@/api/axios";
import { GeoFeature } from "@/components/map/Processing";

const scale = 51000;

type Point = { lat: number; lng: number };
type ElevationSample = Point & { elevation: number };

export type SpaceEditorSettings = {
  showTerrain: boolean;
  showSatelliteImagery: boolean;
  showBuildings: boolean;
  showRoads: boolean;
  showWater: boolean;
  showLandCover: boolean;
  showTrees: boolean;
  terrainExaggeration: number;
  buildingScale: number;
  baseThickness: number;
};

function elevationAt(samples: ElevationSample[], point: Point) {
  if (!samples.length) return 0;
  const latitudes = samples.map((sample) => sample.lat);
  const longitudes = samples.map((sample) => sample.lng);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const gridSize = Math.round(Math.sqrt(samples.length));

  if (gridSize < 2 || north === south || east === west) return samples[0].elevation;

  const rowPosition = THREE.MathUtils.clamp(((point.lat - south) / (north - south)) * (gridSize - 1), 0, gridSize - 1);
  const columnPosition = THREE.MathUtils.clamp(((point.lng - west) / (east - west)) * (gridSize - 1), 0, gridSize - 1);
  const row0 = Math.floor(rowPosition);
  const row1 = Math.min(gridSize - 1, row0 + 1);
  const column0 = Math.floor(columnPosition);
  const column1 = Math.min(gridSize - 1, column0 + 1);
  const rowWeight = rowPosition - row0;
  const columnWeight = columnPosition - column0;
  const sampleAt = (row: number, column: number) => samples[row * gridSize + column]?.elevation ?? 0;
  const top = THREE.MathUtils.lerp(sampleAt(row0, column0), sampleAt(row0, column1), columnWeight);
  const bottom = THREE.MathUtils.lerp(sampleAt(row1, column0), sampleAt(row1, column1), columnWeight);
  return THREE.MathUtils.lerp(top, bottom, rowWeight);
}

function CameraFrame({ center, fitVersion = 0 }: { center: any[]; fitVersion?: number }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!center?.[0] || !center?.[1]) return;
    const width = Math.abs(center[1].lng - center[0].lng) * scale;
    const height = Math.abs(center[1].lat - center[0].lat) * scale;
    const sceneSize = Math.max(120, Math.max(width, height));
    const distance = Math.max(95, sceneSize * 1.18);
    camera.position.set(distance * 0.72, distance * 0.78, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, center, fitVersion]);

  return null;
}

function CameraFocus({ point }: { point: { x: number; z: number } | null }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!point) return;
    camera.position.set(point.x + 18, camera.position.y, point.z + 18);
    camera.lookAt(point.x, 0, point.z);
  }, [camera, point]);
  return null;
}

function CameraSurfaceGuard({ samples, center, terrainExaggeration = 1 }: { samples: ElevationSample[]; center: any[]; terrainExaggeration?: number }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!center?.[0] || !center?.[1]) return;
    const refLat = (center[1].lat + center[0].lat) / 2;
    const refLng = (center[1].lng + center[0].lng) / 2;
    const latitude = refLat - camera.position.z / scale;
    const longitude = refLng + camera.position.x / (scale * Math.cos((refLat * Math.PI) / 180));
    const terrainHeight = elevationAt(samples, { lat: latitude, lng: longitude }) * terrainExaggeration - 0.12;
    const minimumHeight = terrainHeight + 0.8;
    if (camera.position.y < minimumHeight) {
      camera.position.y = minimumHeight;
    }
  });

  return null;
}

function useElevation(center: any[], enabled: boolean) {
  const [samples, setSamples] = useState<ElevationSample[]>([]);

  useEffect(() => {
    if (!enabled || !center?.[0] || !center?.[1]) {
      setSamples([]);
      return;
    }
    const south = Math.min(center[0].lat, center[1].lat);
    const north = Math.max(center[0].lat, center[1].lat);
    const west = Math.min(center[0].lng, center[1].lng);
    const east = Math.max(center[0].lng, center[1].lng);
    const gridSize = 33;
    const points = Array.from({ length: gridSize * gridSize }, (_, index) => {
      const row = Math.floor(index / gridSize);
      const column = index % gridSize;
      return { lat: south + ((north - south) * row) / (gridSize - 1), lng: west + ((east - west) * column) / (gridSize - 1) };
    });
    const controller = new AbortController();
    const chunks = Array.from({ length: Math.ceil(points.length / 80) }, (_, index) => points.slice(index * 80, (index + 1) * 80));

    Promise.all(chunks.map(async (chunk) => {
      const locations = chunk.map((point) => `${point.lat},${point.lng}`).join("|");
      const response = await fetch(`/api/elevation?locations=${encodeURIComponent(locations)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("elevation unavailable");
      const data = await response.json();
      return data.results.map((result: any, index: number) => ({ ...chunk[index], elevation: result.elevation }));
    }))
      .then((resultChunks) => setSamples(resultChunks.flat()))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSamples([]);
      });

    return () => controller.abort();
  }, [center, enabled]);

  return samples;
}

function lonLatToTile(lng: number, lat: number, zoom: number) {
  const scale = 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function useImagery(center: any[], enabled: boolean) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!enabled || !center?.[0] || !center?.[1]) {
      setTexture(null);
      return;
    }
    const south = Math.min(center[0].lat, center[1].lat);
    const north = Math.max(center[0].lat, center[1].lat);
    const west = Math.min(center[0].lng, center[1].lng);
    const east = Math.max(center[0].lng, center[1].lng);
    const controller = new AbortController();
    const zoom = Math.max(12, Math.min(18, Math.floor(Math.log2(180 / Math.max(east - west, north - south)) + 1)));
    const topLeft = lonLatToTile(west, north, zoom);
    const bottomRight = lonLatToTile(east, south, zoom);
    const minX = Math.floor(topLeft.x);
    const minY = Math.floor(topLeft.y);
    const maxX = Math.floor(bottomRight.x);
    const maxY = Math.floor(bottomRight.y);
    const tileCountX = Math.max(1, Math.min(16, maxX - minX + 1));
    const tileCountY = Math.max(1, Math.min(16, maxY - minY + 1));
    const tileSize = Math.min(256, Math.floor(4096 / Math.max(tileCountX, tileCountY)));
    const canvas = document.createElement("canvas");
    canvas.width = tileCountX * tileSize;
    canvas.height = tileCountY * tileSize;
    const context = canvas.getContext("2d");
    if (!context) return () => controller.abort();
    const loadTile = (x: number, y: number) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        context.drawImage(image, (x - minX) * tileSize, (y - minY) * tileSize, tileSize, tileSize);
        resolve();
      };
      image.onerror = () => reject(new Error("satellite tile unavailable"));
      image.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
    });
    const tiles = [];
    for (let y = minY; y <= minY + tileCountY - 1; y += 1) {
      for (let x = minX; x <= minX + tileCountX - 1; x += 1) tiles.push(loadTile(x, y));
    }
    Promise.all(tiles)
      .then(() => {
        if (controller.signal.aborted) return;
        const loadedTexture = new THREE.CanvasTexture(canvas);
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
        const westOffset = topLeft.x - minX;
        const eastOffset = bottomRight.x - minX;
        const northOffset = topLeft.y - minY;
        const southOffset = bottomRight.y - minY;
        loadedTexture.repeat.set(
          Math.max(0.001, (eastOffset - westOffset) / tileCountX),
          Math.max(0.001, (southOffset - northOffset) / tileCountY)
        );
        loadedTexture.offset.set(
          westOffset / tileCountX,
          1 - southOffset / tileCountY
        );
        loadedTexture.anisotropy = 8;
        loadedTexture.generateMipmaps = true;
        loadedTexture.needsUpdate = true;
        setTexture(loadedTexture);
      })
      .catch(() => setTexture(null));

    return () => {
      controller.abort();
      setTexture(null);
    };
  }, [center, enabled]);

  return texture;
}

function getBuildingColor(tags: any) {
  if (typeof tags?.["building:colour"] === "string" && /^#[0-9a-f]{6}$/i.test(tags["building:colour"])) {
    return tags["building:colour"];
  }
  if (tags?.building === "industrial" || tags?.building === "warehouse") return "#8d969c";
  if (tags?.building === "commercial" || tags?.building === "retail") return "#b98562";
  if (tags?.building === "school" || tags?.building === "university") return "#d4b58c";
  if (tags?.building === "apartments" || tags?.building === "residential") return "#c8c8bf";
  return "#b9b9b1";
}

function Building({
  shape,
  extrudeSettings,
  tags,
  baseHeight,
  onSelect,
  heightScale = 1,
  terrainExaggeration = 1,
}: {
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
  baseHeight: number;
  onSelect?: (data: any) => void;
  heightScale?: number;
  terrainExaggeration?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const buildingColor = getBuildingColor(tags);
  const roofColor = tags?.["roof:colour"] && /^#[0-9a-f]{6}$/i.test(tags["roof:colour"]) ? tags["roof:colour"] : (isNaN(Number(tags?.["building:levels"])) ? "#777b78" : "#626a70");
  const roofHeight = Math.max(0.35, Math.min(0.9, extrudeSettings.depth * 0.025));
  const shapePoints = shape.getPoints();

  const minX = Math.min(...shapePoints.map((point) => point.x));
  const maxX = Math.max(...shapePoints.map((point) => point.x));
  const minY = Math.min(...shapePoints.map((point) => point.y));
  const maxY = Math.max(...shapePoints.map((point) => point.y));
  const footprintWidth = Math.abs(maxX - minX);
  const footprintDepth = Math.abs(maxY - minY);
  const footprintArea = Math.abs(
    shapePoints.reduce((area, point, index) => {
      const next = shapePoints[(index + 1) % shapePoints.length];
      return area + (point.x * next.y - next.x * point.y);
    }, 0) / 2
  );
  const defaultBuildingHeight = !isNaN(parseFloat(tags.height))
    ? parseFloat(tags.height)
    : extrudeSettings.depth;
  const defaultBuildingLevels = tags["building:levels"] || Math.round(extrudeSettings.depth / 3);
  const buildingHeight = defaultBuildingHeight * heightScale;
  const buildingLevels = defaultBuildingLevels;
  const isHighRise = buildingHeight > 18;
  const accentColor = tags?.building === "commercial" || tags?.building === "retail" ? "#6f3429" : "#8f4d3b";

  const edges = shapePoints.map((point, index) => {
    const next = shapePoints[(index + 1) % shapePoints.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(-dy, dx);
    return { point, next, length, angle, mid: new THREE.Vector2((point.x + next.x) / 2, (point.y + next.y) / 2) };
  });

  const entranceIndex = edges.reduce((best, edge, index) => {
    if (edge.length > best.length) {
      return { index, length: edge.length };
    }
    return best;
  }, { index: -1, length: 0 }).index;

  return (
    <group position={[0, baseHeight * terrainExaggeration, 0]} userData={{ exportToGLB: true }}>
      <mesh
        onPointerOver={(e) => {
          setHovered(true);
          e.stopPropagation();
        }}
        onPointerOut={(e) => {
          setHovered(false);
          e.stopPropagation();
        }}
        onClick={(e) => {
          setClicked(!clicked);
          e.stopPropagation();
          onSelect?.({
            tags,
            footprintWidth,
            footprintDepth,
            footprintArea,
            buildingHeight,
            buildingLevels,
          });
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        userData={{ exportToGLB: true }}
      >
        <extrudeGeometry args={[shape, { ...extrudeSettings, depth: extrudeSettings.depth * heightScale }]} />
        <meshStandardMaterial
          color={hovered || clicked ? "#dce7ff" : buildingColor}
          roughness={0.78}
          metalness={0.12}
          emissive={hovered || clicked ? "#eef2ff" : "#000000"}
          emissiveIntensity={hovered || clicked ? 0.04 : 0}
        />
        <Edges color="#4b5563" />
      </mesh>
      {edges.map((edge, index) => {
        if (index === entranceIndex || edge.length < 10) return null;
        const floorCount = Math.max(1, Math.min(10, Number(tags["building:levels"]) || Math.round(buildingHeight / 3)));
        const floorHeight = buildingHeight / floorCount;
        return Array.from({ length: Math.max(0, floorCount - 1) }).map((_, floorIndex) => (
          <mesh
            key={`floor-band-${index}-${floorIndex}`}
            position={[
              edge.mid.x,
              floorHeight * (floorIndex + 1),
              -edge.mid.y,
            ]}
            rotation={[0, -edge.angle, 0]}
            castShadow
          >
            <boxGeometry args={[edge.length * 0.92, 0.055, 0.08]} />
            <meshStandardMaterial color="#777b7d" roughness={0.65} metalness={0.25} />
          </mesh>
        ));
      })}
      {isHighRise && edges.slice(0, 2).map((edge, index) => (
        <mesh
          key={`facade-accent-${index}`}
          position={[edge.mid.x, buildingHeight * 0.5, -edge.mid.y - 0.045]}
          rotation={[0, -edge.angle, 0]}
          castShadow
        >
          <boxGeometry args={[Math.min(0.35, edge.length * 0.08), buildingHeight * 0.94, 0.08]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.15} />
        </mesh>
      ))}
      {edges.flatMap((edge, index) => {
        if (index === entranceIndex || edge.length < 8) return [];
        const floorCount = Math.max(1, Math.min(10, Number(tags["building:levels"]) || Math.round(buildingHeight / 3)));
        const floorHeight = buildingHeight / floorCount;
        const windowHeight = Math.min(floorHeight * 0.38, 0.72);
        const windowCount = Math.max(1, Math.min(3, Math.floor(edge.length / 2.5)));
        const windowWidth = Math.min((edge.length - (windowCount - 1) * 0.15) / windowCount, 2.2);
        return Array.from({ length: floorCount }).flatMap((_, floorIndex) =>
          Array.from({ length: windowCount }).map((__, wi) => {
            const offset = (wi - (windowCount - 1) / 2) * (windowWidth + 0.18);
            return (
              <mesh
                key={`window-${index}-${floorIndex}-${wi}`}
                position={[
                  edge.mid.x + Math.cos(edge.angle) * offset,
                  floorHeight * (floorIndex + 0.52),
                  -edge.mid.y - Math.sin(edge.angle) * offset,
                ]}
                rotation={[0, -edge.angle, 0]}
                castShadow={false}
                receiveShadow={false}
              >
                <boxGeometry args={[windowWidth, windowHeight, 0.06]} />
                <meshStandardMaterial color={floorIndex % 2 ? "#9ed7ef" : "#72b7d8"} roughness={0.25} metalness={0.45} transparent opacity={0.9} />
              </mesh>
            );
          })
        );
      })}
      {entranceIndex >= 0 && (() => {
        const entrance = edges[entranceIndex];
        const doorWidth = Math.min(entrance.length * 0.35, 3.2);
        const doorHeight = Math.min(buildingHeight * 0.26, 1.25);
        const glassWidth = Math.min(entrance.length * 0.65, 5);
        const glassHeight = Math.min(buildingHeight * 0.3, 1.8);
        return (
          <group key="entrance">
            <mesh
              position={[entrance.mid.x, glassHeight / 2 + 0.1, -entrance.mid.y - 0.06]}
              rotation={[0, -entrance.angle, 0]}
              castShadow={false}
              receiveShadow={false}
            >
              <boxGeometry args={[glassWidth, glassHeight, 0.04]} />
              <meshStandardMaterial
                color="#2563eb"
                roughness={0.12}
                metalness={0.9}
                transparent
                opacity={0.75}
              />
            </mesh>
            <mesh
              position={[entrance.mid.x, doorHeight / 2, -entrance.mid.y]}
              rotation={[0, -entrance.angle, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[doorWidth, doorHeight, 0.16]} />
              <meshStandardMaterial color="#2b2b33" roughness={0.35} metalness={0.05} />
            </mesh>
            <mesh
              position={[entrance.mid.x, doorHeight * 0.55, -entrance.mid.y + 0.095]}
              rotation={[0, -entrance.angle, 0]}
              castShadow={false}
            >
              <boxGeometry args={[doorWidth * 0.42, doorHeight * 0.4, 0.04]} />
              <meshStandardMaterial color="#7fb5f7" transparent opacity={0.92} />
            </mesh>
            <mesh
              position={[entrance.mid.x, doorHeight + 0.15, -entrance.mid.y]}
              rotation={[0, -entrance.angle, 0]}
              castShadow={false}
            >
              <boxGeometry args={[doorWidth * 0.62, 0.08, 0.12]} />
              <meshStandardMaterial color="#c7d2fe" />
            </mesh>
          </group>
        );
      })()}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, buildingHeight + roofHeight / 2, 0]}
        castShadow
        receiveShadow
        userData={{ exportToGLB: true }}
      >
        <extrudeGeometry args={[shape, { ...extrudeSettings, depth: roofHeight }]} />
        <meshStandardMaterial color={roofColor} roughness={0.72} metalness={0.3} />
      </mesh>
      <mesh
        position={[0, buildingHeight + roofHeight + 0.13, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
      >
        <extrudeGeometry args={[shape, { ...extrudeSettings, depth: 0.12 }]} />
        <meshStandardMaterial color="#d7d2c8" roughness={0.72} metalness={0.18} />
      </mesh>
      {isHighRise && (
        <group position={[0, buildingHeight + roofHeight + 0.5, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[Math.min(2.4, footprintWidth * 0.28), 0.7, Math.min(2, footprintDepth * 0.28)]} />
            <meshStandardMaterial color="#697177" roughness={0.62} metalness={0.38} />
          </mesh>
          <mesh position={[0, 0.76, 0]} castShadow>
            <boxGeometry args={[Math.min(1.8, footprintWidth * 0.2), 0.12, Math.min(1.5, footprintDepth * 0.2)]} />
            <meshStandardMaterial color="#3d464c" roughness={0.45} metalness={0.55} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function RoadRibbon({ points, width }: { points: [number, number, number][]; width: number }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const first = points[index];
      const second = points[index + 1];
      const dx = second[0] - first[0];
      const dz = second[2] - first[2];
      const length = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      const nx = -dz / length * width / 2;
      const nz = dx / length * width / 2;
      vertices.push(
        first[0] + nx, first[1] + 0.012, first[2] + nz,
        first[0] - nx, first[1] + 0.012, first[2] - nz,
        second[0] + nx, second[1] + 0.012, second[2] + nz,
        second[0] + nx, second[1] + 0.012, second[2] + nz,
        first[0] - nx, first[1] + 0.012, first[2] - nz,
        second[0] - nx, second[1] + 0.012, second[2] - nz,
      );
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    result.computeVertexNormals();
    return result;
  }, [points, width]);
  return (
    <mesh geometry={geometry} receiveShadow userData={{ exportToGLB: true }}>
      <meshStandardMaterial color="#41494b" roughness={0.96} metalness={0.02} />
    </mesh>
  );
}

function Roads({ features, center, samples, terrainExaggeration = 1 }: { features: GeoFeature[]; center: any[]; samples: ElevationSample[]; terrainExaggeration?: number }) {
  if (!center?.length || center.length < 2) return null;
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const roads = features.filter((feature) => feature.featureType === "road");
  const project = (lat: number, lng: number) => new THREE.Vector2(
    (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180),
    (lat - refLat) * scale
  );
  const styleFor = (highway: string) => {
    if (["motorway", "trunk"].includes(highway)) return { width: 1.2, color: "#e5e7eb" };
    if (["primary", "secondary"].includes(highway)) return { width: 0.9, color: "#e5e7eb" };
    if (["tertiary", "residential", "unclassified", "living_street"].includes(highway)) return { width: 0.55, color: "#cbd5e1" };
    return { width: 0.22, color: "#aeb7b9" };
  };
  return (
    <group userData={{ exportToGLB: true }}>
      {roads.map((road, index) => {
        if (!road.geometry || road.geometry.length < 2) return null;
        const style = styleFor(road.tags.highway || "path");
        const points = road.geometry.map((pt) => {
          const projected = project(pt.lat, pt.lng);
          return [projected.x, elevationAt(samples, pt) * terrainExaggeration + 0.08, -projected.y] as [number, number, number];
        });

        return (
          <group key={`${road.id}-${index}`}>
            <RoadRibbon points={points} width={style.width} />
            <Line
              points={points}
              color="#d8d1bc"
              lineWidth={style.width + 0.24}
            />
            <Line
              points={points}
              color={style.color}
              lineWidth={style.width}
            />
            {style.width >= 0.4 && (
              <Line
                points={points}
                color="#f8e7a9"
                lineWidth={0.035}
                dashed
                dashSize={0.42}
                gapSize={0.32}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function MarkerModel({ marker, baseHeight = 0 }: { marker: any; baseHeight?: number }) {
  const removeMarker = useAreaStore((state) => state.removeMarker);

  const colorMap: Record<string, string> = {
    enemy: "#ef4444",
    hospital: "#60a5fa",
    rescue: "#f59e0b",
    note: "#facc15",
    soldier: "#111827",
  };

  const color = colorMap[marker.type] || "#9ca3af";

  return (
    <group
      position={[marker.x, baseHeight, marker.z]}
      onClick={(event) => {
        event.stopPropagation();
        removeMarker(marker.id);
      }}
      userData={{ exportToGLB: true }}
    >
      {marker.type === "enemy" && (
        <mesh castShadow receiveShadow>
          <octahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {marker.type === "hospital" && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.5, 0.24]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.12, 0.16]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </>
      )}
      {marker.type === "rescue" && (
        <mesh castShadow receiveShadow>
          <tetrahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {marker.type === "note" && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.22, 0.18, 0.03]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.03, 0.015]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.12, 0.02]} />
            <meshStandardMaterial color="#fff7cc" />
          </mesh>
        </>
      )}
      {marker.type === "soldier" && (
        <group position={[0, 0.12, 0]}>
          <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.18, 18, 18]} />
            <meshStandardMaterial color="#f9c74f" />
          </mesh>
          <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.44, 14]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.12, 0.08, 16]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
          <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.44, 10]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          <mesh position={[-0.2, 0.05, 0]} rotation={[0, 0, Math.PI / 10]} castShadow receiveShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.34, 10]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0.2, 0.05, 0]} rotation={[0, 0, -Math.PI / 10]} castShadow receiveShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.34, 10]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <coneGeometry args={[0.12, 0.22, 14]} />
            <meshStandardMaterial color="#d92626" />
          </mesh>
        </group>
      )}
      {marker.type === "checkpoint" && (
        <mesh castShadow receiveShadow>
          <octahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial color="#dc2626" emissive="#7f1d1d" emissiveIntensity={0.25} />
        </mesh>
      )}
      {marker.note && (
        <Html position={[0, 0.8, 0]} center>
          <div
            style={{
              background: "rgba(255,255,255,0.94)",
              borderRadius: "8px",
              padding: "4px 8px",
              fontSize: "11px",
              color: "#111827",
              border: "1px solid #d1d5db",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            {marker.note}
          </div>
        </Html>
      )}
    </group>
  );
}

function geographicDistance(first: Soldier, second: Soldier) {
  const earthRadius = 6371000;
  const lat1 = THREE.MathUtils.degToRad(first.latitude);
  const lat2 = THREE.MathUtils.degToRad(second.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = THREE.MathUtils.degToRad(second.longitude - first.longitude);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const horizontal = 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return { horizontal, spatial: Math.sqrt(horizontal ** 2 + (second.altitude - first.altitude) ** 2) };
}

function DistanceMeasurements({ soldiers }: { soldiers: Soldier[] }) {
  const pairs = soldiers.length <= 12
    ? soldiers.flatMap((first, firstIndex) => soldiers.slice(firstIndex + 1).map((second) => ({ first, second, ...geographicDistance(first, second) })))
    : [];

  return (
    <group userData={{ exportToGLB: true }}>
      {pairs.map(({ first, second, horizontal, spatial }) => {
        const midpoint = new THREE.Vector3((first.x + second.x) / 2, Math.max(first.altitude, second.altitude) + 1.4, (first.z + second.z) / 2);
        return (
          <group key={`${first.id}-${second.id}`}>
            <Line points={[[first.x, first.altitude + 0.2, first.z], [second.x, second.altitude + 0.2, second.z]]} color="#dc2626" lineWidth={2.5} />
            <Html position={midpoint} center distanceFactor={18} style={{ pointerEvents: "none" }}>
              <div style={{ background: "rgba(127, 29, 29, 0.92)", color: "#fff", border: "1px solid #fecaca", borderRadius: 5, padding: "3px 6px", whiteSpace: "nowrap", fontSize: 10, lineHeight: 1.25, textAlign: "center" }}>
                {horizontal.toFixed(1)} m<br />3D {spatial.toFixed(1)} m
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function SoldierModel({ soldier, selected, onSelect }: { soldier: Soldier; selected: boolean; onSelect: () => void }) {
  return (
    <group position={[soldier.x, soldier.altitude, soldier.z]} rotation={[0, soldier.rotation, 0]} userData={{ exportToGLB: true }} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} userData={{ exportToGLB: true }}>
          <ringGeometry args={[0.48, 0.58, 20]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
        </mesh>
      )}
      <group position={[0, 0.95, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow userData={{ exportToGLB: true }}>
          <sphereGeometry args={[0.2, 10, 8]} />
          <meshStandardMaterial color="#b87954" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.53, 0]} castShadow userData={{ exportToGLB: true }}>
          <cylinderGeometry args={[0.24, 0.27, 0.13, 10]} />
          <meshStandardMaterial color="#4b5d3b" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.03, 0]} castShadow userData={{ exportToGLB: true }}>
          <boxGeometry args={[0.38, 0.58, 0.22]} />
          <meshStandardMaterial color="#536b45" roughness={0.95} />
        </mesh>
        <mesh position={[-0.28, 0.02, 0]} rotation={[0, 0, 0.08]} castShadow userData={{ exportToGLB: true }}>
          <capsuleGeometry args={[0.07, 0.38, 4, 6]} />
          <meshStandardMaterial color="#536b45" />
        </mesh>
        <mesh position={[0.28, 0.02, 0]} rotation={[0, 0, -0.08]} castShadow userData={{ exportToGLB: true }}>
          <capsuleGeometry args={[0.07, 0.38, 4, 6]} />
          <meshStandardMaterial color="#536b45" />
        </mesh>
        <mesh position={[-0.11, -0.45, 0]} castShadow userData={{ exportToGLB: true }}>
          <boxGeometry args={[0.14, 0.42, 0.16]} />
          <meshStandardMaterial color="#374536" />
        </mesh>
        <mesh position={[0.11, -0.45, 0]} castShadow userData={{ exportToGLB: true }}>
          <boxGeometry args={[0.14, 0.42, 0.16]} />
          <meshStandardMaterial color="#374536" />
        </mesh>
        <mesh position={[0.32, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow userData={{ exportToGLB: true }}>
          <cylinderGeometry args={[0.035, 0.035, 0.5, 6]} />
          <meshStandardMaterial color="#20251f" />
        </mesh>
      </group>
      <Html position={[0, 2.25, 0]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
        <div style={{ background: selected ? "#1d4ed8" : "rgba(15,23,42,0.88)", color: "#fff", border: selected ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "3px 7px", textAlign: "center", whiteSpace: "nowrap", fontSize: 11, lineHeight: 1.2, boxShadow: "0 3px 10px rgba(0,0,0,0.2)" }}>
          <strong>{soldier.name || "Unnamed"}</strong><br />{soldier.unitId || "No ID"}
        </div>
      </Html>
    </group>
  );
}

function landCoverColor(tags: Record<string, string | undefined>) {
  if (tags.landuse === "farmland") return "#a8a269";
  if (tags.landuse === "residential") return "#9b9b82";
  if (tags.landuse === "park" || tags.landuse === "grass") return "#73945a";
  if (tags.natural === "scrub") return "#7c8650";
  if (tags.landuse === "forest" || tags.natural === "wood") return "#496b43";
  return "#79935e";
}

function InstancedTrees({ positions }: { positions: Array<{ x: number; y: number; z: number; scale: number; rotation: number; color: string }> }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.06, 0.09, 0.9, 6), []);
  const canopyGeometry = useMemo(() => new THREE.SphereGeometry(0.42, 8, 6), []);
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#765338", roughness: 0.95 }), []);
  const canopyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const rotation = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    positions.forEach((tree, index) => {
      rotation.set(0, tree.rotation, 0);
      matrix.compose(new THREE.Vector3(tree.x, tree.y + tree.scale * 0.45, tree.z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(tree.scale, tree.scale, tree.scale));
      trunkRef.current?.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(tree.x, tree.y + tree.scale * 1.08, tree.z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(tree.scale, tree.scale, tree.scale));
      canopyRef.current?.setMatrixAt(index, matrix);
      canopyRef.current?.setColorAt(index, new THREE.Color(tree.color));
    });
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true;
    if (canopyRef.current) {
      canopyRef.current.instanceMatrix.needsUpdate = true;
      if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true;
    }
  }, [matrix, positions, rotation]);

  if (!positions.length) return null;
  return (
    <group userData={{ exportToGLB: true }}>
      <instancedMesh ref={trunkRef} args={[trunkGeometry, trunkMaterial, positions.length]} castShadow frustumCulled userData={{ exportToGLB: true }} />
      <instancedMesh ref={canopyRef} args={[canopyGeometry, canopyMaterial, positions.length]} castShadow frustumCulled userData={{ exportToGLB: true }} />
    </group>
  );
}

function WaterSurface({ geometry, position }: { geometry: THREE.BufferGeometry; position: [number, number, number] }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.opacity = 0.74 + Math.sin(clock.elapsedTime * 1.25) * 0.035;
    }
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} geometry={geometry} receiveShadow userData={{ exportToGLB: true }}>
      <meshPhysicalMaterial ref={materialRef} color="#187f9b" transparent opacity={0.78} roughness={0.18} metalness={0.55} transmission={0.08} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

function GeographicFeatures({ features, center, samples, terrainExaggeration = 1, showTrees = true }: { features: GeoFeature[]; center: any[]; samples: ElevationSample[]; terrainExaggeration?: number; showTrees?: boolean }) {
  const refLat = center?.length >= 2 ? (center[1].lat + center[0].lat) / 2 : 0;
  const refLng = center?.length >= 2 ? (center[1].lng + center[0].lng) / 2 : 0;
  const project = (point: Point) => {
    const x = (point.lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (point.lat - refLat) * scale;
    return { x, y };
  };
  const polygons = features.filter((feature) =>
    (feature.featureType === "green" || feature.featureType === "water") &&
    feature.geometry && feature.geometry.length >= 3
  );
  const trees = showTrees ? features.filter((feature) => feature.featureType === "tree" || feature.tags.natural === "tree_row" || feature.tags.natural === "wood" || feature.tags.landuse === "forest") : [];
  const waterLines = features.filter((feature) => feature.featureType === "water" && feature.geometry && feature.geometry.length >= 2 && feature.geometry.length < 3);
  const treePositions = useMemo(() => {
    const result: Array<{ x: number; y: number; z: number; scale: number; rotation: number; color: string }> = [];
    let seed = 17;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    trees.forEach((feature) => {
      const geometry = feature.geometry || [];
      const isPolygon = geometry.length >= 3;
      const sourcePoints = isPolygon ? geometry : geometry.slice(0, 1);
      const count = isPolygon ? Math.min(70, Math.max(6, Math.round(geometry.length * 1.8))) : 1;
      const south = Math.min(...geometry.map((point) => point.lat));
      const north = Math.max(...geometry.map((point) => point.lat));
      const west = Math.min(...geometry.map((point) => point.lng));
      const east = Math.max(...geometry.map((point) => point.lng));
      for (let index = 0; index < count && result.length < 1200; index += 1) {
        let point = sourcePoints[0];
        if (isPolygon) {
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const candidate = { lat: south + (north - south) * random(), lng: west + (east - west) * random() };
            let inside = false;
            for (let i = 0, j = geometry.length - 1; i < geometry.length; j = i++) {
              if ((geometry[i].lng > candidate.lng) !== (geometry[j].lng > candidate.lng) && candidate.lat < (geometry[j].lat - geometry[i].lat) * (candidate.lng - geometry[i].lng) / (geometry[j].lng - geometry[i].lng) + geometry[i].lat) inside = !inside;
            }
            if (inside) {
              point = candidate;
              break;
            }
          }
        }
        const projected = project(point);
        result.push({ x: projected.x, y: elevationAt(samples, point) * terrainExaggeration, z: -projected.y, scale: 0.7 + random() * 0.75, rotation: random() * Math.PI * 2, color: ["#416b3e", "#557f45", "#6d8c4e"][Math.floor(random() * 3)] });
      }
    });
    return result;
  }, [features, refLat, refLng, samples, terrainExaggeration, trees]);

  if (!center?.length || center.length < 2) return null;
  return (
    <group userData={{ exportToGLB: true }}>
      {polygons.map((feature, index) => {
        const points = feature.geometry!.map(project);
        const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point.x, point.y)));
        const geometry = new THREE.ShapeGeometry(shape);
        if (feature.featureType === "water") {
          return <WaterSurface key={`${feature.id}-${index}`} geometry={geometry} position={[0, elevationAt(samples, feature.geometry![0]) * terrainExaggeration - 0.16, 0]} />;
        }
        return (
          <mesh key={`${feature.id}-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, elevationAt(samples, feature.geometry![0]) * terrainExaggeration + 0.04, 0]} geometry={geometry} receiveShadow userData={{ exportToGLB: true }}>
            <meshStandardMaterial color={landCoverColor(feature.tags)} transparent opacity={0.92} roughness={0.98} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
        );
      })}
      {waterLines.map((feature, index) => (
        <Line
          key={`water-${feature.id}-${index}`}
          points={feature.geometry!.map((point) => {
            const projected = project(point);
            return [projected.x, elevationAt(samples, point) * terrainExaggeration - 0.1, -projected.y] as [number, number, number];
          })}
          color="#4da3c7"
          lineWidth={2.5}
        />
      ))}
      <InstancedTrees positions={treePositions} />
    </group>
  );
}

function Vegetation({
  areas,
  center,
  soldierPreview,
  onPreviewSoldier,
  samples,
  placementMode,
  onTerrainClick,
  checkpointMode,
  showTerrain,
  terrainExaggeration,
  baseThickness,
  showSatelliteImagery,
}: {
  areas: any[];
  center: any[];
  soldierPreview: { x: number; z: number } | null;
  onPreviewSoldier: (point: { x: number; z: number }) => void;
  samples: ElevationSample[];
  placementMode: "normal" | "add" | "move";
  onTerrainClick: (point: { x: number; z: number; latitude: number; longitude: number; altitude: number }) => void;
  checkpointMode: boolean;
  showTerrain: boolean;
  terrainExaggeration: number;
  baseThickness: number;
  showSatelliteImagery: boolean;
}) {
  if (!center?.[0] || !center?.[1]) return null;

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const imagery = useImagery(center, showSatelliteImagery && center.length >= 2);
  const markers = useAreaStore((state) => state.markers);
  const selectedMarkerType = useAreaStore((state) => state.selectedMarkerType);
  const noteText = useAreaStore((state) => state.noteText);
  const addMarker = useAreaStore((state) => state.addMarker);
  const advanceMode = useAreaStore((state) => state.advanceMode);
  const advancePoints = useAreaStore((state) => state.advancePoints);
  const advanceColor = useAreaStore((state) => state.advanceColor);
  const filledShapes = useAreaStore((state) => state.filledShapes);
  const addAdvancePoint = useAreaStore((state) => state.addAdvancePoint);

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  const terrainGeometry = useMemo(() => {
    const width = Math.max(350, Math.abs(center[1].lng - center[0].lng) * scale * Math.cos((refLat * Math.PI) / 180));
    const height = Math.max(350, Math.abs(center[1].lat - center[0].lat) * scale);
    const geometry = new THREE.PlaneGeometry(width, height, 40, 40);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const point = {
        lat: refLat + y / scale,
        lng: refLng + x / (scale * Math.cos((refLat * Math.PI) / 180)),
      };
      position.setZ(index, elevationAt(samples, point) * terrainExaggeration);
    }
    geometry.computeVertexNormals();
    const elevations = Array.from({ length: position.count }, (_, index) => position.getZ(index));
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const colors = new Float32Array(position.count * 3);
    const low = new THREE.Color("#5c7f4c");
    const mid = new THREE.Color("#9a8a58");
    const high = new THREE.Color("#c2bda6");
    const rock = new THREE.Color("#777875");
    const normal = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      normal.fromBufferAttribute(geometry.attributes.normal as THREE.BufferAttribute, index);
      const elevationRatio = THREE.MathUtils.clamp((elevations[index] - minElevation) / Math.max(1, maxElevation - minElevation), 0, 1);
      const slope = 1 - Math.abs(normal.y);
      const color = new THREE.Color().lerpColors(low, elevationRatio < 0.62 ? mid : high, THREE.MathUtils.smoothstep(elevationRatio, 0.2, 0.85));
      if (slope > 0.42) color.lerp(rock, THREE.MathUtils.clamp((slope - 0.42) * 2.2, 0, 0.82));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }, [center, refLat, refLng, samples, terrainExaggeration]);

  const terrainBlock = useMemo(() => {
    const width = Math.max(350, Math.abs(center[1].lng - center[0].lng) * scale * Math.cos((refLat * Math.PI) / 180));
    const depth = Math.max(350, Math.abs(center[1].lat - center[0].lat) * scale);
    const minimumElevation = samples.length ? Math.min(...samples.map((sample) => sample.elevation)) : 0;
    const maximumElevation = samples.length ? Math.max(...samples.map((sample) => sample.elevation)) : 0;
    const height = Math.max(baseThickness, (maximumElevation - minimumElevation) * terrainExaggeration + baseThickness);
    return { width, depth, height, y: minimumElevation * terrainExaggeration - height / 2 };
  }, [baseThickness, center, refLat, samples, terrainExaggeration]);

  const areaPolygons = useMemo(
    () =>
      areas
        .filter((area: any) => area.geometry && area.geometry.length >= 3)
        .map((area: any) => {
          const shapePoints = area.geometry.map((pt: any) => project(pt.lat, pt.lng));
          if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1])) {
            shapePoints.push(shapePoints[0]);
          }
          const outline = shapePoints.map((point, index) => new THREE.Vector3(
            point.x,
            elevationAt(samples, area.geometry[index % area.geometry.length]) + 0.05,
            -point.y
          ));
          return {
            shape: new THREE.Shape(shapePoints),
            outline,
          };
        }),
    [areas, refLat, refLng, samples]
  );


  const handlePlaceMarker = (event: any) => {
    if (!event?.point) return;
    event.stopPropagation();

    if (placementMode !== "normal") {
      const latitude = refLat - event.point.z / scale;
      const longitude = refLng + event.point.x / (scale * Math.cos((refLat * Math.PI) / 180));
      onTerrainClick({ x: event.point.x, z: event.point.z, latitude, longitude, altitude: elevationAt(samples, { lat: latitude, lng: longitude }) });
      return;
    }

    if (checkpointMode) {
      addMarker({ type: "checkpoint", x: event.point.x, z: event.point.z });
      return;
    }

    if (advanceMode) {
      addAdvancePoint({ x: event.point.x, z: event.point.z });
      return;
    }

    return;
  };

  const advanceShape = advancePoints.length >= 3 ? useMemo(() => {
    const shape = new THREE.Shape(
      advancePoints.map((point) => new THREE.Vector2(point.x, point.z))
    );
    return new THREE.ShapeGeometry(shape);
  }, [advancePoints]) : null;

  const savedShapeGeometries = useMemo(
    () =>
      filledShapes.map((shapeData) => {
        const shape = new THREE.Shape(
          shapeData.points.map((point) => new THREE.Vector2(point.x, point.z))
        );
        return {
          id: shapeData.id,
          color: shapeData.color,
          geometry: new THREE.ShapeGeometry(shape),
        };
      }),
    [filledShapes]
  );

  return (
    <group userData={{ exportToGLB: true }}>
      {showTerrain && <mesh position={[0, terrainBlock.y, 0]} receiveShadow userData={{ exportToGLB: true }}>
        <boxGeometry args={[terrainBlock.width, terrainBlock.height, terrainBlock.depth]} />
        <meshStandardMaterial color="#705744" roughness={0.96} metalness={0} />
      </mesh>}
      {showTerrain && <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.12, 0]} onPointerDown={handlePlaceMarker} geometry={terrainGeometry} userData={{ exportToGLB: true }}>
        <meshStandardMaterial map={imagery} vertexColors={!imagery} color={imagery ? "#ffffff" : "#ffffff"} roughness={0.94} metalness={0.02} />
      </mesh>}

      {advanceMode && (
        <group>
          {advancePoints.map((point, index) => {
            const pointLat = refLat - point.z / scale;
            const pointLng = refLng + point.x / (scale * Math.cos((refLat * Math.PI) / 180));
            return (
            <mesh key={`advance-point-${index}`} position={[point.x, elevationAt(samples, { lat: pointLat, lng: pointLng }) + 0.25, point.z]}>
              <sphereGeometry args={[0.32, 20, 20]} />
              <meshStandardMaterial color="#f59e0b" emissive="#fbbf24" emissiveIntensity={0.7} />
            </mesh>
            );
          })}

          {advancePoints.length > 1 && (
            <Line
              points={advancePoints.map((point) => {
                const pointLat = refLat - point.z / scale;
                const pointLng = refLng + point.x / (scale * Math.cos((refLat * Math.PI) / 180));
                return [point.x, elevationAt(samples, { lat: pointLat, lng: pointLng }) + 0.12, point.z];
              })}
              color="#f59e0b"
              lineWidth={2}
              dashed={false}
            />
          )}

          {advanceShape && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, elevationAt(samples, { lat: refLat, lng: refLng }) + 0.05, 0]}
              geometry={advanceShape}
            >
              <meshStandardMaterial color={advanceColor} opacity={0.4} transparent />
            </mesh>
          )}
        </group>
      )}

      {savedShapeGeometries.map((shapeDef) => (
        <mesh
          key={shapeDef.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, elevationAt(samples, { lat: refLat, lng: refLng }) + 0.05, 0]}
          geometry={shapeDef.geometry}
        >
          <meshStandardMaterial color={shapeDef.color} opacity={0.45} transparent />
        </mesh>
      ))}

      {areaPolygons.map((area, index) => (
        <group key={index} userData={{ exportToGLB: true }}>
          <Line points={area.outline} color="#264d22" lineWidth={2} />
        </group>
      ))}

      {markers.map((marker) => {
        const markerLat = refLat - marker.z / scale;
        const markerLng = refLng + marker.x / (scale * Math.cos((refLat * Math.PI) / 180));
        return <MarkerModel key={marker.id} marker={marker} baseHeight={elevationAt(samples, { lat: markerLat, lng: markerLng })} />;
      })}

      {soldierPreview && (
        <group position={[soldierPreview.x, 0.12, soldierPreview.z]} userData={{ exportToGLB: true }}>
          <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.18, 18, 18]} />
            <meshStandardMaterial color="#f9c74f" opacity={0.8} transparent />
          </mesh>
          <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.44, 14]} />
            <meshStandardMaterial color="#1f2937" opacity={0.8} transparent />
          </mesh>
          <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.12, 0.08, 16]} />
            <meshStandardMaterial color="#374151" opacity={0.8} transparent />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function Export() {
  const { scene } = useThree();
  const action = useActionStore((state) => state.action);
  const fleetSpaceId = useActionStore((state) => state.fleetSpaceId);

  const exportType = useActionStore((state) => state.exportType);

  const setAction = useActionStore((state) => state.setAction);

  useEffect(() => {
    if (action === true) {
      setAction(false);
      exportGLB();
    }
  }, [action, setAction, scene]);

  const uploadFleet = async (blob) => {
    const formData = new FormData();

    formData.append("object", blob, "box3d.glb");
    formData.append("title", "New Object");
    formData.append("description", "");
    formData.append("spaceId", fleetSpaceId);

    await instanceFleet.post("space/file/mesh", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  };

  const exportGLB = () => {
    const exportRoot = new THREE.Group();
    scene.traverse((child) => {
      if (child.userData?.exportToGLB === true) {
        exportRoot.add(child.clone(true));
      }
    });
    const exporter = new GLTFExporter();
    const options = { binary: true, embedImages: true };
    exporter.parse(
      exportRoot,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: "model/gltf-binary" });

          if (exportType == "glb") {
            const link = document.createElement("a");
            link.style.display = "none";
            document.body.appendChild(link);
            link.href = URL.createObjectURL(blob);
            link.download = "scene.glb";
            link.click();
            document.body.removeChild(link);
          }

          if (exportType == "fleet") {
            uploadFleet(blob);
          }
        } else {
          console.error("GLB export failed: unexpected result", result);
        }
      },
      (error) => {
        console.error("An error occurred during export", error);
      },
      options
    );
  };
  return null;
}

export function Space({
  step = 2,
  editorSettings,
  fitVersion = 0,
}: {
  step?: number;
  editorSettings?: Partial<SpaceEditorSettings>;
  fitVersion?: number;
}) {
  const settings: SpaceEditorSettings = {
    showTerrain: true,
    showSatelliteImagery: true,
    showBuildings: true,
    showRoads: true,
    showWater: true,
    showLandCover: true,
    showTrees: true,
    terrainExaggeration: 1,
    buildingScale: 1,
    baseThickness: 12,
    ...editorSettings,
  };
  const areas = useAreaStore((state) => state.areas);
  const features = useAreaStore((state) => state.features);
  const soldiers = useAreaStore((state) => state.soldiers);
  const selectedSoldierId = useAreaStore((state) => state.selectedSoldierId);
  const measurementSoldierIds = useAreaStore((state) => state.measurementSoldierIds);
  const addSoldier = useAreaStore((state) => state.addSoldier);
  const updateSoldier = useAreaStore((state) => state.updateSoldier);
  const removeSoldier = useAreaStore((state) => state.removeSoldier);
  const selectSoldier = useAreaStore((state) => state.selectSoldier);
  const toggleMeasurementSoldier = useAreaStore((state) => state.toggleMeasurementSoldier);
  const clearMeasurementSoldiers = useAreaStore((state) => state.clearMeasurementSoldiers);
  const center = useAreaStore((state) => state.center);
  const refLat = center.length >= 2 ? (center[1].lat + center[0].lat) / 2 : 0;
  const refLng = center.length >= 2 ? (center[1].lng + center[0].lng) / 2 : 0;
  const samples = useElevation(center, center.length >= 2);
  const [placementMode, setPlacementMode] = useState<"normal" | "add" | "move">("normal");
  const [measurementMode, setMeasurementMode] = useState(false);
  const [checkpointMode, setCheckpointMode] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; z: number } | null>(null);
  const [showSoldierTools, setShowSoldierTools] = useState(false);

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  const areaData = () => {
    const result: Array<{
      shape: THREE.Shape;
      extrudeSettings: any;
      tags: any;
      baseHeight: number;
    }> = [];
    areas.forEach((bld: any) => {
      if (!bld.geometry || bld.geometry.length < 3) return;
      const shapePoints = bld.geometry.map((pt: any) => project(pt.lat, pt.lng));
      if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1]))
        shapePoints.push(shapePoints[0]);
      const shape = new THREE.Shape(shapePoints);
      const centroid = bld.geometry.reduce(
        (sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }),
        { lat: 0, lng: 0 }
      );
      centroid.lat /= bld.geometry.length;
      centroid.lng /= bld.geometry.length;
      let heightValue = parseFloat(bld.tags.height || "");
      const heightLevels = parseFloat(bld.tags["building:levels"] || "");
      if (isNaN(heightValue) && !isNaN(heightLevels)) heightValue = heightLevels * 3;
      if (isNaN(heightValue)) heightValue = 10;
      const extrudeSettings = {
        steps: 1,
        depth: heightValue,
        bevelEnabled: false,
      };
      result.push({ shape, extrudeSettings, tags: bld.tags, baseHeight: elevationAt(samples, centroid) });
    });
    return result;
  };

  const buildingsData = areaData();

  useEffect(() => {
    if (!import.meta.env.DEV || center.length < 2) return;
    console.log("MODEL CENTER", { latitude: refLat, longitude: refLng });
    areas.slice(0, 3).forEach((building: any) => {
      const point = building.geometry?.[0];
      if (!point) return;
      const projected = project(point.lat, point.lng);
      console.log("FEATURE COORDINATE", {
        osm: { latitude: point.lat, longitude: point.lng },
        three: { x: projected.x, y: elevationAt(samples, point), z: -projected.y },
      });
    });
  }, [areas, center, refLat, refLng, samples]);

  const [selectedBuilding, setSelectedBuilding] = useState<null | {
    tags: any;
    footprintWidth: number;
    footprintDepth: number;
    footprintArea: number;
    buildingHeight: number;
    buildingLevels: number;
  }>(null);
  const selectedSoldier = soldiers.find((soldier) => soldier.id === selectedSoldierId) || null;
  const [soldierName, setSoldierName] = useState("");
  const [soldierUnitId, setSoldierUnitId] = useState("");
  const [soldierPreview, setSoldierPreview] = useState<{ x: number; z: number } | null>(null);
  const advanceMode = useAreaStore((state) => state.advanceMode);
  const advancePoints = useAreaStore((state) => state.advancePoints);
  const completeAdvanceShape = useAreaStore((state) => state.completeAdvanceShape);
  const clearAdvancePoints = useAreaStore((state) => state.clearAdvancePoints);
  const addMarker = useAreaStore((state) => state.addMarker);
  const noteText = useAreaStore((state) => state.noteText);
  const thirdMode = useCarStore((state) => state.thirdMode);
  const setThirdMode = useCarStore((state) => state.setThirdMode);

  const handleTerrainClick = (point: { x: number; z: number; latitude: number; longitude: number; altitude: number }) => {
    if (placementMode === "move" && selectedSoldierId) {
      updateSoldier(selectedSoldierId, point);
      setPlacementMode("normal");
      return;
    }
    if (placementMode === "add") {
      const nextNumber = soldiers.length + 1;
      addSoldier({ ...point, name: "New Soldier", unitId: `S-${String(nextNumber).padStart(2, "0")}`, rotation: 0 });
      setPlacementMode("normal");
    }
  };

  const focusSoldier = (soldier: Soldier) => {
    selectSoldier(soldier.id);
    setFocusPoint({ x: soldier.x, z: soldier.z });
  };

  const handleSoldierSelect = (soldier: Soldier) => {
    if (measurementMode) {
      toggleMeasurementSoldier(soldier.id);
      return;
    }
    focusSoldier(soldier);
  };

  const handleBuildingSelect = (building: any) => {
    setSelectedBuilding(building);
  };

  useEffect(() => {
    setSoldierName(selectedSoldier?.name || "");
    setSoldierUnitId(selectedSoldier?.unitId || "");
  }, [selectedSoldierId, selectedSoldier?.name, selectedSoldier?.unitId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ fov: 65, near: 0.1, far: 7000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance", outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
      >
        <CameraFrame center={center} fitVersion={fitVersion} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        <CameraFocus point={focusPoint} />
        <CameraSurfaceGuard samples={samples} center={center} terrainExaggeration={settings.terrainExaggeration} />
        <color attach="background" args={["#8798a8"]} />
        <fog attach="fog" args={["#8798a8", 420, 2200]} />
        <ambientLight intensity={0.62} />
        <hemisphereLight args={["#dbeafe", "#334155", 0.72]} />
        <directionalLight position={[-180, 320, 220]} intensity={3.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-far={5000} shadow-camera-left={-2500} shadow-camera-right={2500} shadow-camera-top={2500} shadow-camera-bottom={-2500} shadow-bias={-0.0001} shadow-normalBias={0.02} />
        {settings.showBuildings && buildingsData.map((item, index) => (
            <Building
              key={index}
            shape={item.shape}
            extrudeSettings={item.extrudeSettings}
            tags={item.tags}
            baseHeight={item.baseHeight}
            onSelect={handleBuildingSelect}
            heightScale={settings.buildingScale}
            terrainExaggeration={settings.terrainExaggeration}
          />
        ))}

        {soldiers.map((soldier) => (
          <SoldierModel key={soldier.id} soldier={soldier} selected={soldier.id === selectedSoldierId || measurementSoldierIds.includes(soldier.id)} onSelect={() => handleSoldierSelect(soldier)} />
        ))}
        {measurementMode && measurementSoldierIds.length >= 2 && <DistanceMeasurements soldiers={soldiers.filter((soldier) => measurementSoldierIds.includes(soldier.id))} />}

        {settings.showRoads && <Roads features={features} center={center} samples={samples} terrainExaggeration={settings.terrainExaggeration} />}
        <GeographicFeatures
          features={features.filter((feature) =>
            (settings.showWater || feature.featureType !== "water") &&
            (settings.showLandCover || feature.featureType !== "green") &&
            (settings.showTrees || feature.featureType !== "tree")
          )}
          center={center}
          samples={samples}
          terrainExaggeration={settings.terrainExaggeration}
          showTrees={settings.showTrees}
        />
        <Vegetation
          areas={areas}
          center={center}
          soldierPreview={soldierPreview}
          onPreviewSoldier={setSoldierPreview}
          samples={samples}
          placementMode={placementMode}
          onTerrainClick={handleTerrainClick}
          checkpointMode={checkpointMode}
          showTerrain={settings.showTerrain}
          showSatelliteImagery={settings.showSatelliteImagery}
          terrainExaggeration={settings.terrainExaggeration}
          baseThickness={settings.baseThickness}
        />
        <pointLight position={[-10, 80, -10]} decay={0} intensity={0.28} color="#ffd7a3" />
        <Car />
        <Export />
        <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0.4} azimuth={0.3} />
        <Environment preset="sunset" />
      </Canvas>

      {soldierPreview && (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            maxWidth: 320,
            padding: "14px",
            background: "rgba(255,255,255,0.96)",
            borderRadius: "16px",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
            color: "#111827",
            fontSize: "13px",
            lineHeight: 1.5,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "8px" }}>
            Place Soldier
          </div>
          <div style={{ marginBottom: "10px" }}>
            Click "Place" to drop the soldier here.
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              style={{
                cursor: "pointer",
                padding: "0.65rem 0.85rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontWeight: 600,
              }}
              onClick={() => {
                addMarker({
                  type: "soldier",
                  x: soldierPreview.x,
                  z: soldierPreview.z,
                  note: noteText.trim() || undefined,
                });
                setSoldierPreview(null);
              }}
            >
              Place
            </button>
            <button
              style={{
                cursor: "pointer",
                padding: "0.65rem 0.85rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#fef2f2",
                color: "#b91c1c",
                fontWeight: 600,
              }}
              onClick={() => setSoldierPreview(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 2 && <div style={{ position: "absolute", left: 16, top: 16, width: 250, maxWidth: "calc(100% - 32px)", padding: 10, background: "rgba(255,255,255,0.95)", borderRadius: 12, boxShadow: "0 12px 30px rgba(15,23,42,0.16)", color: "#111827", fontSize: 12, lineHeight: 1.4, zIndex: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setShowSoldierTools((open) => !open)}
            aria-expanded={showSoldierTools}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, padding: "5px 4px", border: 0, background: "transparent", color: "#111827", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
          >
            <span>Soldiers</span>
            <span style={{ color: "#64748b" }}>{soldiers.length} {showSoldierTools ? "⌃" : "⌄"}</span>
          </button>
          <button
            type="button"
            onClick={() => setThirdMode(!thirdMode)}
            style={{ border: 0, borderRadius: 7, padding: "6px 9px", background: thirdMode ? "#1d4ed8" : "#e2e8f0", color: thirdMode ? "#fff" : "#334155", cursor: "pointer", fontWeight: 700 }}
          >
            {thirdMode ? "Exit" : "Navigate"}
          </button>
        </div>
        {showSoldierTools && <>
        <button
          type="button"
          onClick={() => { setPlacementMode(placementMode === "add" ? "normal" : "add"); selectSoldier(null); setCheckpointMode(false); setMeasurementMode(false); clearMeasurementSoldiers(); }}
          style={{ width: "100%", border: 0, borderRadius: 7, padding: "8px 10px", background: placementMode === "add" ? "#1d4ed8" : "#0f766e", color: "#fff", cursor: "pointer", fontWeight: 700 }}
        >
          {placementMode === "add" ? "Click terrain to place" : "+ Add Soldier"}
        </button>
        <button
          type="button"
          onClick={() => { setMeasurementMode(!measurementMode); if (measurementMode) clearMeasurementSoldiers(); setPlacementMode("normal"); setCheckpointMode(false); }}
          style={{ width: "100%", marginTop: 6, border: "1px solid #fecaca", borderRadius: 7, padding: "8px 10px", background: measurementMode ? "#991b1b" : "#fff1f2", color: measurementMode ? "#fff" : "#991b1b", cursor: "pointer", fontWeight: 700 }}
        >
          {measurementMode ? "Distance Mode Active" : "Measure Distance"}
        </button>
        <button
          type="button"
          onClick={() => { setCheckpointMode(!checkpointMode); setPlacementMode("normal"); setMeasurementMode(false); clearMeasurementSoldiers(); }}
          style={{ width: "100%", marginTop: 6, border: "1px solid #fecaca", borderRadius: 7, padding: "8px 10px", background: checkpointMode ? "#b91c1c" : "#fff", color: checkpointMode ? "#fff" : "#991b1b", cursor: "pointer", fontWeight: 700 }}
        >
          {checkpointMode ? "Add Checkpoint Mode Active" : "+ Add Checkpoint"}
        </button>
        {checkpointMode && <div style={{ marginTop: 7, padding: 7, borderRadius: 6, background: "#fff1f2", color: "#991b1b" }}>Click the terrain to place a checkpoint.</div>}
        {measurementMode && <div style={{ marginTop: 7, padding: 7, borderRadius: 6, background: "#fff1f2", color: "#991b1b" }}>Select 2 or more soldiers to measure distance.</div>}
        {placementMode === "move" && (
          <div style={{ marginTop: 8, padding: 8, borderRadius: 7, background: "#fef3c7", color: "#92400e" }}>
            Click a new terrain location to move {selectedSoldier?.name || "this soldier"}.
          </div>
        )}
        {selectedSoldier && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, marginBottom: 7 }}>Selected Soldier</div>
            <label style={{ display: "block", marginBottom: 6 }}>Name<input value={soldierName} onChange={(event) => setSoldierName(event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "6px 7px", border: "1px solid #cbd5e1", borderRadius: 6 }} /></label>
            <label style={{ display: "block", marginBottom: 8 }}>ID<input value={soldierUnitId} onChange={(event) => setSoldierUnitId(event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 3, padding: "6px 7px", border: "1px solid #cbd5e1", borderRadius: 6 }} /></label>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => updateSoldier(selectedSoldier.id, { name: soldierName.trim() || "Unnamed", unitId: soldierUnitId.trim() || "No ID" })} style={{ flex: 1, border: 0, borderRadius: 6, padding: "7px", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Save</button>
              <button type="button" onClick={() => setPlacementMode("move")} style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px", background: "#fff", color: "#334155", cursor: "pointer", fontWeight: 700 }}>Move</button>
              <button type="button" onClick={() => removeSoldier(selectedSoldier.id)} style={{ border: 0, borderRadius: 6, padding: "7px", background: "#fee2e2", color: "#b91c1c", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10, maxHeight: 150, overflowY: "auto" }}>
          {soldiers.map((soldier) => (
            <button key={soldier.id} type="button" onClick={() => handleSoldierSelect(soldier)} style={{ textAlign: "left", border: measurementSoldierIds.includes(soldier.id) || soldier.id === selectedSoldierId ? "1px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", background: measurementSoldierIds.includes(soldier.id) ? "#fff1f2" : soldier.id === selectedSoldierId ? "#eff6ff" : "#fff", color: "#1e293b", cursor: "pointer" }}>
              <strong>{soldier.name}</strong> <span style={{ color: "#64748b" }}>{soldier.unitId}</span>
            </button>
          ))}
          {soldiers.length === 0 && <span style={{ color: "#64748b" }}>No soldiers placed.</span>}
        </div>
        {measurementMode && measurementSoldierIds.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #e5e7eb", maxHeight: 180, overflowY: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Distance Measurement ({measurementSoldierIds.length})</div>
            {measurementSoldierIds.length > 12 ? <div style={{ color: "#64748b" }}>Many units selected. Connections are simplified; use the list for exact unit selection.</div> : measurementSoldierIds.length < 2 ? <div style={{ color: "#64748b" }}>Select one more soldier.</div> : measurementSoldierIds.flatMap((firstId, index) => measurementSoldierIds.slice(index + 1).map((secondId) => {
              const first = soldiers.find((soldier) => soldier.id === firstId);
              const second = soldiers.find((soldier) => soldier.id === secondId);
              if (!first || !second) return null;
              const distance = geographicDistance(first, second);
              return <div key={`${first.id}-${second.id}`} style={{ padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}><strong>{first.name} {first.unitId}</strong> ↔ <strong>{second.name} {second.unitId}</strong><br />Horizontal {distance.horizontal.toFixed(1)} m · 3D {distance.spatial.toFixed(1)} m</div>;
            }))}
            <button type="button" onClick={() => { clearMeasurementSoldiers(); setMeasurementMode(false); }} style={{ marginTop: 8, width: "100%", border: "1px solid #fecaca", borderRadius: 6, padding: "6px", background: "#fff", color: "#b91c1c", cursor: "pointer", fontWeight: 700 }}>Clear Measurements</button>
          </div>
        )}
        </>}
      </div>}

      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          maxWidth: 320,
          padding: "16px",
          background: "rgba(255,255,255,0.95)",
          borderRadius: "16px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
          color: "#111827",
          fontSize: "13px",
          lineHeight: 1.5,
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>
          Building Info
        </div>
        {selectedBuilding ? (
          <div>
            <div style={{ marginBottom: "8px", fontWeight: 600 }}>{selectedBuilding.tags.name || "Unnamed Building"}</div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>Height:</span> {selectedBuilding.buildingHeight.toFixed(1)}m ({selectedBuilding.tags.height ? "OSM value" : "estimated from footprint/levels"})
            </div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>Width:</span> {selectedBuilding.footprintWidth.toFixed(1)}m
            </div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>Depth:</span> {selectedBuilding.footprintDepth.toFixed(1)}m
            </div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>Footprint Area:</span> {selectedBuilding.footprintArea.toFixed(1)} m²
            </div>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>Floors:</span> {selectedBuilding.buildingLevels}
            </div>
            {(
              (selectedBuilding.tags && (selectedBuilding.tags.sai_vidya === "yes" || selectedBuilding.tags.svit === "yes")) ||
              (selectedBuilding.tags.name && selectedBuilding.tags.name.trim().toLowerCase() === "sai vidya institute")
            ) && (
              <div style={{ marginTop: "12px", padding: "10px", borderRadius: "10px", background: "rgba(245, 248, 255, 0.88)" }}>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>Sai Vidya Institute Details</div>
                <div>Number of floors: 2</div>
                <div>Basketball courts: 1</div>
                <div>Big ground in front of college</div>
                <div>Established in 2008</div>
              </div>
            )}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>Tags</div>
              <div style={{ maxHeight: "170px", overflowY: "auto", paddingRight: "4px" }}>
                {Object.entries(selectedBuilding.tags).map(([key, value]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#4b5563" }}>{key}</span>
                    <span style={{ color: "#111827" }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>Select a building in the scene to view details here.</div>
        )}
      </div>

      {advanceMode && (
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            maxWidth: 320,
            padding: "14px",
            background: "rgba(255,255,255,0.96)",
            borderRadius: "16px",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
            color: "#111827",
            fontSize: "13px",
            lineHeight: 1.5,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>
            Advance Shape Mode
          </div>
          <div style={{ marginBottom: "8px" }}>
            Click on the terrain to place points. When you have 3 or more points, complete the shape.
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              style={{
                cursor: "pointer",
                padding: "0.65rem 0.85rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontWeight: 600,
              }}
              onClick={completeAdvanceShape}
              disabled={advancePoints.length < 3}
            >
              Complete Shape
            </button>
            <button
              style={{
                cursor: "pointer",
                padding: "0.65rem 0.85rem",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#fef2f2",
                color: "#b91c1c",
                fontWeight: 600,
              }}
              onClick={clearAdvancePoints}
            >
              Cancel
            </button>
          </div>
          <div style={{ marginTop: "10px", fontSize: "12px", color: "#6b7280" }}>
            Points placed: {advancePoints.length}
          </div>
        </div>
      )}
    </div>
  );
}
