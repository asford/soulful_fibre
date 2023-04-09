import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import ReactDOM from "react-dom/client";
import * as THREE from "three";

import { OrbitControls, OrthographicCamera } from "@react-three/drei";

import "./main.css";

interface ArrayLike<T> {
  readonly length: number;
  [n: number]: T;
}

class Vec3Buffer {
  size: number;

  constructor(public data: ArrayLike<number>) {
    if (data.length % 3 != 0) {
      throw new Error("Invalid data length");
    }

    this.size = data.length / 3;
  }

  static view(data: ArrayLike<number>): Vec3Buffer {
    return new Vec3Buffer(data);
  }

  static empty(size: number): Vec3Buffer {
    return new Vec3Buffer(new Float32Array(3 * size));
  }

  get(i: number): THREE.Vector3 {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * 3;

    return new THREE.Vector3(
      this.data[offset + 0],
      this.data[offset + 1],
      this.data[offset + 2],
    );
  }

  set(i: number, vec: THREE.Vector3) {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * 3;

    this.data[offset + 0] = vec.x;
    this.data[offset + 1] = vec.y;
    this.data[offset + 2] = vec.z;
  }
}

const CustomGeometryParticles = (props: { count: number }) => {
  const { count } = props;

  // This reference gives us direct access to our points
  const points = useRef<THREE.Points>(null!);

  // Generate our positions attributes array
  const particlesPosition = useMemo(() => {
    const pos = Vec3Buffer.empty(count);
    const distance = 1;

    for (let i = 0; i < count; i++) {
      const theta = THREE.MathUtils.randFloatSpread(2 * Math.PI);
      const phi = THREE.MathUtils.randFloatSpread(2 * Math.PI);
      pos.set(
        i,
        new THREE.Vector3(
          distance * Math.sin(theta) * Math.cos(phi),
          distance * Math.sin(theta) * Math.sin(phi),
          distance * Math.cos(theta),
        ),
      );
    }

    return pos.data;
  }, [count]);

  // Chen-Lee Attractor
  // @ref https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2
  function chen_lee(p: THREE.Vector3): THREE.Vector3 {
    const alpha = 5.0;
    const beta = -10.0;
    const gamma = -0.38;
    return new THREE.Vector3(
      alpha * p.x - p.y * p.z,
      beta * p.y + p.x * p.z,
      gamma * p.z + (p.x * p.y) / 3.0,
    );
  }

  const dfactor = 0.1;
  useFrame((state, delta) => {
    const { clock } = state;

    // @ts-expect-error
    const pos = Vec3Buffer.view(
      points.current.geometry.attributes.position.array,
    );

    for (let i = 0; i < count; i++) {
      const point = pos.get(i);
      const dp_dt = chen_lee(point);
      const result = point.add(dp_dt.multiplyScalar(delta * dfactor));
      pos.set(i, result);
    }

    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesPosition.length / 3}
          array={particlesPosition}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.2}
        color="#5786F5"
        sizeAttenuation={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div style={{ width: "100vw", height: "100vh", background: "black" }}>
    <Canvas camera={{ position: [25, 25, 60] }}>
      <ambientLight intensity={1} />
      <CustomGeometryParticles count={250_000} />
      <OrbitControls autoRotate />
    </Canvas>
  </div>,
);
