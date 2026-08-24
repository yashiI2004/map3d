import { useEffect, useMemo, useState } from "react";
import { Canvas, extend, ReactThreeFiber, useFrame, useThree } from "@react-three/fiber";
import { Soldier, useAreaStore } from "@/state/areaStore";
import { Html, Sky, Environment, Line, Edges } from "@react-three/drei";
import * as THREE from "three";
import { useActionStore } from "@/state/exportStore";
import { GLTFExporter } from "three/examples/jsm/Addons.js";
import Car from "./Car";
import instanceFleet from "@/api/axios";
import { GeoFeature } from "@/components/map/Processing";

const scale = 51000;

type Point = { lat: number; lng: number };
type ElevationSample = Point & { elevation: number };

function elevationAt(samples: ElevationSample[], point: Point) {
  if (!samples.length) return 0;
  return samples.reduce((nearest, sample) => {
    const distance = (sample.lat - point.lat) ** 2 + (sample.lng - point.lng) ** 2;
    const nearestDistance = (nearest.lat - point.lat) ** 2 + (nearest.lng - point.lng) ** 2;
    return distance < nearestDistance ? sample : nearest;
  }).elevation;
}

function CameraFrame({ center }: { center: any[] }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!center?.[0] || !center?.[1]) return;
    const width = Math.abs(center[1].lng - center[0].lng) * scale;
    const height = Math.abs(center[1].lat - center[0].lat) * scale;
    const distance = Math.max(35, Math.max(width, height) * 0.9);
    camera.position.set(0, distance * 0.72, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, center]);

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

function CameraSurfaceGuard({ samples, center }: { samples: ElevationSample[]; center: any[] }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!center?.[0] || !center?.[1]) return;
    const refLat = (center[1].lat + center[0].lat) / 2;
    const refLng = (center[1].lng + center[0].lng) / 2;
    const latitude = refLat - camera.position.z / scale;
    const longitude = refLng + camera.position.x / (scale * Math.cos((refLat * Math.PI) / 180));
    const terrainHeight = elevationAt(samples, { lat: latitude, lng: longitude }) - 0.12;
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
    const points = Array.from({ length: 25 }, (_, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      return { lat: south + ((north - south) * row) / 4, lng: west + ((east - west) * column) / 4 };
    });
    const locations = points.map((point) => `${point.lat},${point.lng}`).join("|");
    fetch(`/api/elevation?locations=${encodeURIComponent(locations)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("elevation unavailable")))
      .then((data) => setSamples(data.results.map((result: any, index: number) => ({ ...points[index], elevation: result.elevation }))))
      .catch(() => setSamples([]));
  }, [center, enabled]);

  return samples;
}

function getBuildingColor(tags: any) {
  return "#facc15";
}

function Building({
  shape,
  extrudeSettings,
  tags,
  baseHeight,
  onSelect,
}: {
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
  baseHeight: number;
  onSelect?: (data: any) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const buildingColor = getBuildingColor(tags);
  const roofHeight = Math.max(0.2, Math.min(0.6, extrudeSettings.depth * 0.02));
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
  const defaultBuildingLevels = tags["building:levels"] || Math.round(extrudeSettings.depth / 2.2);
  const isSaiVidya =
    typeof tags.name === "string" &&
    tags.name.toLowerCase().includes("sai vidya");
  const buildingHeight = isSaiVidya ? 8.0 : defaultBuildingHeight;
  const buildingLevels = isSaiVidya ? 2 : defaultBuildingLevels;

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
    <group position={[0, baseHeight, 0]} userData={{ exportToGLB: true }}>
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
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial
          color={hovered || clicked ? "#dce7ff" : buildingColor}
          roughness={0.9}
          metalness={0.05}
          emissive={hovered || clicked ? "#eef2ff" : "#000000"}
          emissiveIntensity={hovered || clicked ? 0.04 : 0}
        />
        <Edges color="#4b5563" />
      </mesh>
      {edges.flatMap((edge, index) => {
        if (index === entranceIndex || edge.length < 8) return [];
        const windowHeight = Math.min(extrudeSettings.depth * 0.14, 0.35);
        const windowCount = Math.max(1, Math.min(3, Math.floor(edge.length / 2.5)));
        const windowWidth = Math.min((edge.length - (windowCount - 1) * 0.15) / windowCount, 2.2);
        return Array.from({ length: windowCount }).map((_, wi) => {
          const offset = (wi - (windowCount - 1) / 2) * (windowWidth + 0.18);
          return (
            <mesh
              key={`window-${index}-${wi}`}
              position={[edge.mid.x + Math.cos(edge.angle) * offset, extrudeSettings.depth * 0.55, -edge.mid.y - Math.sin(edge.angle) * offset]}
              rotation={[0, -edge.angle, 0]}
              castShadow={false}
              receiveShadow={false}
            >
              <boxGeometry args={[windowWidth, windowHeight, 0.04]} />
              <meshStandardMaterial color="#7cb5f7" roughness={0.3} metalness={0.6} transparent opacity={0.88} />
            </mesh>
          );
        });
      })}
      {entranceIndex >= 0 && (() => {
        const entrance = edges[entranceIndex];
        const doorWidth = Math.min(entrance.length * 0.35, 3.2);
        const doorHeight = Math.min(extrudeSettings.depth * 0.26, 1.25);
        const glassWidth = Math.min(entrance.length * 0.65, 5);
        const glassHeight = Math.min(extrudeSettings.depth * 0.3, 1.8);
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
        position={[0, extrudeSettings.depth + roofHeight / 2, 0]}
        castShadow
        receiveShadow
        userData={{ exportToGLB: true }}
      >
        <extrudeGeometry args={[shape, { ...extrudeSettings, depth: roofHeight }]} />
        <meshStandardMaterial color="#d9d9d9" roughness={0.9} metalness={0.2} />
      </mesh>
    </group>
  );
}

function Roads({ features, center, samples }: { features: GeoFeature[]; center: any[]; samples: ElevationSample[] }) {
  if (!center?.length || center.length < 2) return null;
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const roads = features.filter((feature) => feature.featureType === "road");
  const project = (lat: number, lng: number) => new THREE.Vector2(
    (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180),
    (lat - refLat) * scale
  );
  const styleFor = (highway: string) => {
    if (["motorway", "trunk"].includes(highway)) return { width: 0.9, color: "#b45309" };
    if (["primary", "secondary"].includes(highway)) return { width: 0.65, color: "#d97706" };
    if (["tertiary", "residential", "unclassified", "living_street"].includes(highway)) return { width: 0.42, color: "#6b7280" };
    return { width: 0.16, color: "#9ca3af" };
  };
  return (
    <group userData={{ exportToGLB: true }}>
      {roads.map((road, index) => {
        if (!road.geometry || road.geometry.length < 2) return null;
        const style = styleFor(road.tags.highway || "path");
        const points = road.geometry.map((pt) => {
          const projected = project(pt.lat, pt.lng);
          return [projected.x, elevationAt(samples, pt) + 0.08, -projected.y] as [number, number, number];
        });

        return (
          <Line
            key={`${road.id}-${index}`}
            points={points}
            color={style.color}
            lineWidth={style.width}
          />
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

function GeographicFeatures({ features, center, samples }: { features: GeoFeature[]; center: any[]; samples: ElevationSample[] }) {
  if (!center?.length || center.length < 2) return null;
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const project = (point: Point) => {
    const x = (point.lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (point.lat - refLat) * scale;
    return { x, y };
  };
  const polygons = features.filter((feature) =>
    (feature.featureType === "green" || feature.featureType === "water") &&
    feature.geometry && feature.geometry.length >= 3
  );
  const trees = features.filter((feature) => feature.featureType === "tree" || feature.tags.natural === "tree_row");
  const waterLines = features.filter((feature) => feature.featureType === "water" && feature.geometry && feature.geometry.length >= 2 && feature.geometry.length < 3);

  return (
    <group userData={{ exportToGLB: true }}>
      {polygons.map((feature, index) => {
        const points = feature.geometry!.map(project);
        const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point.x, point.y)));
        return (
          <mesh key={`${feature.id}-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, elevationAt(samples, feature.geometry![0]) + 0.02, 0]} geometry={new THREE.ShapeGeometry(shape)} receiveShadow>
            <meshStandardMaterial color={feature.featureType === "water" ? "#4da3c7" : feature.tags.landuse === "forest" || feature.tags.natural === "wood" ? "#4f7f45" : "#83a95b"} transparent opacity={0.82} roughness={0.9} />
          </mesh>
        );
      })}
      {waterLines.map((feature, index) => (
        <Line
          key={`water-${feature.id}-${index}`}
          points={feature.geometry!.map((point) => {
            const projected = project(point);
            return [projected.x, elevationAt(samples, point) + 0.06, -projected.y] as [number, number, number];
          })}
          color="#4da3c7"
          lineWidth={2.5}
        />
      ))}
      {trees.slice(0, 600).map((feature, index) => (feature.geometry || []).map((point, pointIndex) => {
        const projected = project(point);
        const base = elevationAt(samples, point);
        return (
          <group key={`${feature.id}-${index}-${pointIndex}`} position={[projected.x, base, -projected.y]}>
            <mesh position={[0, 0.45, 0]} castShadow userData={{ exportToGLB: true }}>
              <cylinderGeometry args={[0.06, 0.08, 0.9, 6]} />
              <meshStandardMaterial color="#765338" />
            </mesh>
            <mesh position={[0, 1.1, 0]} castShadow userData={{ exportToGLB: true }}>
              <coneGeometry args={[0.42, 1.1, 7]} />
              <meshStandardMaterial color="#3f7d45" roughness={0.95} />
            </mesh>
          </group>
        );
      }))}
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
}: {
  areas: any[];
  center: any[];
  soldierPreview: { x: number; z: number } | null;
  onPreviewSoldier: (point: { x: number; z: number }) => void;
  samples: ElevationSample[];
  placementMode: "normal" | "add" | "move";
  onTerrainClick: (point: { x: number; z: number; latitude: number; longitude: number; altitude: number }) => void;
  checkpointMode: boolean;
}) {
  if (!center?.[0] || !center?.[1]) return null;

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
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
    const width = Math.max(5000, Math.abs(center[1].lng - center[0].lng) * scale * Math.cos((refLat * Math.PI) / 180));
    const height = Math.max(5000, Math.abs(center[1].lat - center[0].lat) * scale);
    const geometry = new THREE.PlaneGeometry(width, height, 16, 16);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const point = {
        lat: refLat + y / scale,
        lng: refLng + x / (scale * Math.cos((refLat * Math.PI) / 180)),
      };
      position.setZ(index, elevationAt(samples, point));
    }
    geometry.computeVertexNormals();
    return geometry;
  }, [center, refLat, refLng, samples]);

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.12, 0]} onPointerDown={handlePlaceMarker} geometry={terrainGeometry} userData={{ exportToGLB: true }}>
        <meshStandardMaterial color="#3e6c2f" roughness={0.92} metalness={0.04} />
      </mesh>

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

export function Space({ step = 2 }: { step?: number }) {
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
  const samples = useElevation(center, areas.length > 0);
  const [placementMode, setPlacementMode] = useState<"normal" | "add" | "move">("normal");
  const [measurementMode, setMeasurementMode] = useState(false);
  const [checkpointMode, setCheckpointMode] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; z: number } | null>(null);

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
      if (isNaN(heightValue)) heightValue = 10;
      if (isNaN(heightValue) && !isNaN(heightLevels)) heightValue = heightLevels * 2.2;
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
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ fov: 90, near: 0.1, far: 7000 }} shadows>
        <CameraFrame center={center} />
        <CameraFocus point={focusPoint} />
        <CameraSurfaceGuard samples={samples} center={center} />
        <ambientLight intensity={Math.PI / 2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
        {buildingsData.map((item, index) => (
          <Building
            key={index}
            shape={item.shape}
            extrudeSettings={item.extrudeSettings}
            tags={item.tags}
            baseHeight={item.baseHeight}
            onSelect={handleBuildingSelect}
          />
        ))}

        {soldiers.map((soldier) => (
          <SoldierModel key={soldier.id} soldier={soldier} selected={soldier.id === selectedSoldierId || measurementSoldierIds.includes(soldier.id)} onSelect={() => handleSoldierSelect(soldier)} />
        ))}
        {measurementMode && measurementSoldierIds.length >= 2 && <DistanceMeasurements soldiers={soldiers.filter((soldier) => measurementSoldierIds.includes(soldier.id))} />}

        <Roads features={features} center={center} samples={samples} />
        <GeographicFeatures features={features} center={center} samples={samples} />
        <Vegetation
          areas={areas}
          center={center}
          soldierPreview={soldierPreview}
          onPreviewSoldier={setSoldierPreview}
          samples={samples}
          placementMode={placementMode}
          onTerrainClick={handleTerrainClick}
          checkpointMode={checkpointMode}
        />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
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

      {step === 2 && <div style={{ position: "absolute", left: 16, top: 16, width: 250, maxWidth: "calc(100% - 32px)", padding: 14, background: "rgba(255,255,255,0.95)", borderRadius: 12, boxShadow: "0 12px 30px rgba(15,23,42,0.16)", color: "#111827", fontSize: 12, lineHeight: 1.4, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong>Soldiers</strong>
          <span style={{ color: "#64748b" }}>{soldiers.length}</span>
        </div>
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
              <span style={{ fontWeight: 600 }}>Height:</span> {selectedBuilding.buildingHeight.toFixed(1)}m
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
