import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import ReactDOM from "react-dom/client";
import * as THREE from "three";

import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Stats } from "@react-three/drei";
import { useControls, monitor, Leva } from "leva";

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

interface VecIsh {
  x: number;
  y: number;
  z: number;
}
interface PartStats {
  count: number;
  valid: number;
  max_mag: number;
}
function empty_stats(): PartStats {
  return { count: 0, valid: 0, max_mag: 0 };
}

class PartGuard {
  static MAX_TRIES: number = 10;
  stats: PartStats;
  constructor(
    public mag_threshold: number,
    public resample?: () => THREE.Vector3,
  ) {
    this.stats = empty_stats();
  }

  check(vec: THREE.Vector3): boolean {
    const mag = vec.length();

    if (mag > this.stats.max_mag) {
      this.stats.max_mag = mag;
    }

    return mag < this.mag_threshold;
  }
  guard(vec: THREE.Vector3): THREE.Vector3 {
    this.stats.count += 1;

    if (this.check(vec)) {
      this.stats.valid += 1;
      return vec;
    }

    if (!this.resample) {
      return vec;
    }

    for (var tries = 0; tries < PartGuard.MAX_TRIES; tries += 1) {
      const sample = this.resample();
      if (this.check(sample)) {
        return sample;
      }
    }
    return vec;
  }
}

function monitor_ref(ref) {
  return monitor(
    () => {
      return JSON.stringify(
        ref.current,
        (key, value) => {
          if (typeof value == "number") {
            return value.toPrecision(3);
          } else {
            return value;
          }
        },
        2,
      );
    },
    { graph: false },
  );
}

const CustomGeometryParticles = (props: { count: number }) => {
  const { count } = props;

  // This reference gives us direct access to our points
  const points = useRef<THREE.Points>(null!);
  const point_stats = useRef<PartStats>(empty_stats());
  const run_delta = useRef<number>(0);

  const { step_size } = useControls({
    step_size: { value: 1e-1, min: 1e-3, max: 1, step: 1e-3 },
    delta: monitor_ref(run_delta),
    point_stats: monitor_ref(point_stats),
  });

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

  useFrame((state, delta) => {
    run_delta.current = delta;

    const pos = Vec3Buffer.view(
      // @ts-expect-error
      points.current.geometry.attributes.position.array,
    );

    const point_guard = new PartGuard(1e3, () => {
      const candidate = pos.get(THREE.MathUtils.randInt(0, pos.size));
      return candidate.addScaledVector(
        candidate,
        THREE.MathUtils.randFloatSpread(1e-2),
      );
    });

    for (let i = 0; i < count; i++) {
      const point = pos.get(i);
      const dp_dt = chen_lee(point);

      pos.set(
        i,
        point_guard.guard(point.addScaledVector(dp_dt, delta * step_size)),
      );
    }

    point_stats.current = point_guard.stats;

    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particlesPosition}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1}
        color="#5786F5"
        sizeAttenuation={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

function App(props: { diag?: boolean }) {
  let { diag = false } = props;
  let diag_element;
  if (props.diag) {
    diag_element = (
      <div>
        <Stats />
        <Leva />
      </div>
    );
  } else {
    diag_element = (
      <div>
        <Leva hidden />
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [25, 25, 60] }}>
        <ambientLight intensity={1} />
        <CustomGeometryParticles count={200e3} />
        <OrbitControls autoRotate autoRotateSpeed={1.0} />
      </Canvas>
      {diag_element}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App diag={true} />,
);

addEventListener("click", function () {
  this.document.body.requestFullscreen();
});
