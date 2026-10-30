import React, { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCarStore } from "@/state/carStore";

const Car = () => {
  const carRef = useRef<any>(null);
  const { camera } = useThree();
  const thirdMode = useCarStore((state) => state.thirdMode);
  const setThirdMode = useCarStore((state) => state.setThirdMode);
  const controls = useCarStore((state) => state.controls);
  const setControl = useCarStore((state) => state.setControl);
  const resetControls = useCarStore((state) => state.resetControls);
  const velocity = useRef(0);
  const handleKeyDown = useCallback((e) => {
    if (!thirdMode) return;

    switch (e.key.toLowerCase()) {
      case "w":
      case "arrowup":
        setControl("forward", true);
        e.preventDefault();
        break;
      case "s":
      case "arrowdown":
        setControl("backward", true);
        e.preventDefault();
        break;
      case "a":
      case "arrowleft":
        setControl("left", true);
        e.preventDefault();
        break;
      case "d":
      case "arrowright":
        setControl("right", true);
        e.preventDefault();
        break;
      case "escape":
        setThirdMode(false);
        velocity.current = 0;
        resetControls();
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
        break;
      default:
        break;
    }
  }, [resetControls, setControl, setThirdMode, thirdMode]);

  const handleKeyUp = useCallback((e) => {
    switch (e.key.toLowerCase()) {
      case "w":
      case "arrowup":
        setControl("forward", false);
        e.preventDefault();
        break;
      case "s":
      case "arrowdown":
        setControl("backward", false);
        e.preventDefault();
        break;
      case "a":
      case "arrowleft":
        setControl("left", false);
        e.preventDefault();
        break;
      case "d":
      case "arrowright":
        setControl("right", false);
        e.preventDefault();
        break;
      default:
        break;
    }
  }, [setControl]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    if (thirdMode) {
      const handleBlur = () => resetControls();
      window.addEventListener("blur", handleBlur);
      return () => {
        window.removeEventListener("blur", handleBlur);
      };
    }
    resetControls();
  }, [thirdMode, resetControls]);

  useEffect(() => {
    if (thirdMode) {
      const onMouseMove = (event) => {
        if (document.pointerLockElement === document.body && carRef.current) {
          carRef.current.rotation.y -= event.movementX * 0.002;
        }
      };
      document.addEventListener("mousemove", onMouseMove);
      return () => document.removeEventListener("mousemove", onMouseMove);
    }
  }, [thirdMode]);

  useFrame((state, delta) => {
    if (carRef.current) {
      const acceleration = controls.forward ? 18 : controls.backward ? -11 : 0;
      velocity.current = THREE.MathUtils.clamp(
        velocity.current + acceleration * delta,
        -8,
        22
      );
      if (!acceleration) {
        velocity.current = THREE.MathUtils.damp(velocity.current, 0, 5, delta);
      }

      const steering = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
      if (steering && Math.abs(velocity.current) > 0.1) {
        carRef.current.rotation.y += steering * 1.8 * delta * Math.sign(velocity.current);
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carRef.current.quaternion);
      carRef.current.position.addScaledVector(forward, velocity.current * delta);
    }
    if (thirdMode && carRef.current) {
      const carPos = carRef.current.position;
      const offset = new THREE.Vector3(0, 1.65, 0.25);
      offset.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        carRef.current.rotation.y
      );
      const desiredPosition = carPos.clone().add(offset);
      camera.position.lerp(desiredPosition, 0.1);
      camera.lookAt(carPos.x, carPos.y + 1.5, carPos.z - 2);
    }
  });

  return (
    <>
      <group ref={carRef} position={[0, 0.5, 0]} visible={thirdMode}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[1.8, 0.55, 3.2]} />
          <meshStandardMaterial color="#dc2626" roughness={0.35} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.82, 0.2]} castShadow>
          <boxGeometry args={[1.35, 0.58, 1.35]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.35} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.84, -0.05]} castShadow>
          <boxGeometry args={[1.18, 0.38, 1.08]} />
          <meshStandardMaterial color="#93c5fd" roughness={0.12} metalness={0.6} />
        </mesh>
        {[
          [-0.92, 0.28, -1.05],
          [0.92, 0.28, -1.05],
          [-0.92, 0.28, 1.05],
          [0.92, 0.28, 1.05],
        ].map(([x, y, z], index) => (
          <mesh key={`wheel-${index}`} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.2, 16]} />
            <meshStandardMaterial color="#171717" roughness={0.82} />
          </mesh>
        ))}
        {[-0.62, 0.62].map((x) => (
          <mesh key={`headlight-${x}`} position={[x, 0.5, -1.63]} castShadow>
            <boxGeometry args={[0.3, 0.14, 0.05]} />
            <meshStandardMaterial color="#fef3c7" emissive="#facc15" emissiveIntensity={0.8} />
          </mesh>
        ))}
        {[-0.62, 0.62].map((x) => (
          <mesh key={`taillight-${x}`} position={[x, 0.5, 1.63]}>
            <boxGeometry args={[0.3, 0.14, 0.05]} />
            <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>
    </>
  );
};

export default Car;
