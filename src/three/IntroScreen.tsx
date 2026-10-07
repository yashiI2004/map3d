import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { css } from "@emotion/react";

function Stars() {
  const starsRef = useRef<THREE.Points>(null);

  useEffect(() => {
    if (!starsRef.current) return;

    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 4000;
      positions[i + 1] = (Math.random() - 0.5) * 4000;
      positions[i + 2] = (Math.random() - 0.5) * 4000;
    }

    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starsRef.current.geometry = starGeometry;
  }, []);

  return (
    <points ref={starsRef}>
      <pointsMaterial size={10} color="#ffffff" sizeAttenuation={true} />
    </points>
  );
}

function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    // Create a canvas-based Earth texture with realistic colors
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;

    // Ocean blue
    ctx.fillStyle = "#1e5a8e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add continents using noise-like patterns
    ctx.fillStyle = "#2d8f2d";
    const continents = [
      { x: 300, y: 200, w: 200, h: 150 }, // Americas
      { x: 900, y: 150, w: 250, h: 180 }, // Europe/Africa
      { x: 1400, y: 250, w: 300, h: 200 }, // Asia
      { x: 100, y: 600, w: 180, h: 120 }, // Australia
    ];

    continents.forEach((continent) => {
      ctx.fillRect(continent.x, continent.y, continent.w, continent.h);
      // Add some variation
      ctx.fillStyle = "#1f6b1f";
      ctx.fillRect(continent.x + 20, continent.y + 20, continent.w - 40, continent.h - 40);
      ctx.fillStyle = "#2d8f2d";
    });

    // Add some cloud patterns
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const w = Math.random() * 100 + 50;
      const h = Math.random() * 50 + 20;
      ctx.fillRect(x, y, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    if (earthRef.current?.material instanceof THREE.MeshPhongMaterial) {
      earthRef.current.material.map = texture;
    }
  }, []);

  useFrame(() => {
    if (earthRef.current) {
      earthRef.current.rotation.y += 0.0002;
    }
  });

  return (
    <mesh ref={earthRef} position={[0, 0, 0]}>
      <sphereGeometry args={[2, 64, 64]} />
      <meshPhongMaterial
        emissive="#1e5a8e"
        emissiveIntensity={0.2}
        shininess={5}
      />
    </mesh>
  );
}

function Glow() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[2.1, 64, 64]} />
      <meshBasicMaterial
        color="#4da3c7"
        transparent
        opacity={0.15}
      />
    </mesh>
  );
}

function AtmosphereGlow() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[2.3, 32, 32]} />
      <meshBasicMaterial
        color="#87ceeb"
        transparent
        opacity={0.1}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 4.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

function IntroScreenCanvas() {
  return (
    <Canvas
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
      }}
      camera={{ fov: 75, near: 0.1, far: 10000 }}
    >
      <SceneCamera />
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} />
      <Stars />
      <Earth />
      <Glow />
      <AtmosphereGlow />
    </Canvas>
  );
}

interface IntroScreenProps {
  onEnter: () => void;
  isTransitioning: boolean;
}

export function IntroScreen({ onEnter, isTransitioning }: IntroScreenProps) {
  return (
    <div
      css={css({
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2000,
        overflow: "hidden",
        opacity: isTransitioning ? 0 : 1,
        transition: "opacity 1s ease-out",
        pointerEvents: isTransitioning ? "none" : "auto",
      })}
    >
      <IntroScreenCanvas />

      <div
        css={css({
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          top: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          textAlign: "center",
          zIndex: 10,
          background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 100%)",
        })}
      >
        <h1
          css={css({
            fontSize: "5.5rem",
            fontWeight: 900,
            margin: 0,
            marginBottom: "1rem",
            letterSpacing: "2px",
            textShadow: "0 4px 20px rgba(0,0,0,0.8)",
            animation: "fadeInDown 1s ease-out 0.3s both",
            "@keyframes fadeInDown": {
              from: {
                opacity: 0,
                transform: "translateY(-30px)",
              },
              to: {
                opacity: 1,
                transform: "translateY(0)",
              },
            },
          })}
        >
          TERRAIN
        </h1>

        <p
          css={css({
            fontSize: "1.3rem",
            margin: 0,
            marginBottom: "3.5rem",
            fontWeight: 300,
            letterSpacing: "1px",
            opacity: 0.9,
            textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            animation: "fadeIn 1s ease-out 0.6s both",
            "@keyframes fadeIn": {
              from: {
                opacity: 0,
              },
              to: {
                opacity: 0.9,
              },
            },
          })}
        >
          Explore. Model. Simulate.
        </p>

        <button
          onClick={onEnter}
          css={css({
            padding: "16px 48px",
            fontSize: "1.1rem",
            fontWeight: 600,
            letterSpacing: "1.5px",
            color: "#ffffff",
            background: "linear-gradient(135deg, #4da3c7 0%, #2563eb 100%)",
            border: "2px solid rgba(255,255,255,0.3)",
            borderRadius: "50px",
            cursor: "pointer",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            boxShadow: "0 8px 32px rgba(77, 163, 199, 0.4)",
            animation: "fadeInUp 1s ease-out 0.9s both",
            "@keyframes fadeInUp": {
              from: {
                opacity: 0,
                transform: "translateY(30px)",
              },
              to: {
                opacity: 1,
                transform: "translateY(0)",
              },
            },
            "&:hover": {
              background: "linear-gradient(135deg, #5bb5d9 0%, #3b82f6 100%)",
              transform: "translateY(-2px)",
              boxShadow: "0 12px 40px rgba(77, 163, 199, 0.6)",
              borderColor: "rgba(255,255,255,0.5)",
            },
            "&:active": {
              transform: "translateY(0)",
            },
          })}
        >
          ENTER
        </button>
      </div>
    </div>
  );
}
