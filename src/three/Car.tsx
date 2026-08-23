import React, { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
  const keys = useRef({ w: false, s: false, a: false, d: false });
  const velocity = useRef(0);

  const handleKeyDown = useCallback((e) => {
    switch (e.key.toLowerCase()) {
      case "w":
      case "arrowup":
        keys.current.w = true;
        setControl("forward", true);
        break;
      case "s":
      case "arrowdown":
        keys.current.s = true;
        setControl("backward", true);
        break;
      case "a":
      case "arrowleft":
        keys.current.a = true;
        setControl("left", true);
        break;
      case "d":
      case "arrowright":
        keys.current.d = true;
        setControl("right", true);
        break;
      case "escape":
        setThirdMode(false);
        resetControls();
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
        break;
      default:
        break;
    }
  }, [resetControls, setControl, setThirdMode]);

  const handleKeyUp = useCallback((e) => {
    switch (e.key.toLowerCase()) {
      case "w":
      case "arrowup":
        keys.current.w = false;
        setControl("forward", false);
        break;
      case "s":
      case "arrowdown":
        keys.current.s = false;
        setControl("backward", false);
        break;
      case "a":
      case "arrowleft":
        keys.current.a = false;
        setControl("left", false);
        break;
      case "d":
      case "arrowright":
        keys.current.d = false;
        setControl("right", false);
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
      const handleClick = () => {
        if (document.pointerLockElement !== document.body) {
          document.body.requestPointerLock();
        }
      };
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
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
      const accelerationRate = 0.2;
      const maxSpeed = 3.0;
      const decelerationRate = 1.0;
      const forwardInput = keys.current.w || controls.forward;
      const backwardInput = keys.current.s || controls.backward;
      const leftInput = keys.current.a || controls.left;
      const rightInput = keys.current.d || controls.right;

      if (forwardInput) {
        velocity.current = Math.min(
          maxSpeed,
          velocity.current + accelerationRate * delta
        );
      } else if (backwardInput) {
        velocity.current = Math.max(
          -maxSpeed,
          velocity.current - accelerationRate * delta
        );
      } else {
        if (velocity.current > 0) {
          velocity.current = Math.max(
            0,
            velocity.current - decelerationRate * delta
          );
        } else if (velocity.current < 0) {
          velocity.current = Math.min(
            0,
            velocity.current + decelerationRate * delta
          );
        }
      }
      if (leftInput) carRef.current.rotation.y += 0.02;
      if (rightInput) carRef.current.rotation.y -= 0.02;
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(carRef.current.quaternion);
      carRef.current.position.addScaledVector(forward, velocity.current);
    }
    if (thirdMode && carRef.current) {
      const carPos = carRef.current.position;
      const offset = new THREE.Vector3(0, 1, 2);
      offset.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        carRef.current.rotation.y
      );
      const desiredPosition = carPos.clone().add(offset);
      camera.position.lerp(desiredPosition, 0.1);
      camera.lookAt(carPos);
    }
  });

  return (
    <>
      <mesh ref={carRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[0.2, 0.2, 0.4]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      {!thirdMode && <OrbitControls />}
    </>
  );
};

export default Car;
