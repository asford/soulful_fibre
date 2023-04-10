import React, { MutableRefObject, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import ReactDOM from "react-dom/client";
import * as THREE from "three";

import {
  Stats,
  ArcballControls,
  OrbitControls,
  OrthographicCamera,
} from "@react-three/drei";
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

  get(i: number, into: THREE.Vector3): THREE.Vector3 {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * 3;

    into.x = this.data[offset + 0];
    into.y = this.data[offset + 1];
    into.z = this.data[offset + 2];
    return into;
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
function chen_lee(p: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 {
  const alpha = 5.0;
  const beta = -10.0;
  const gamma = -0.38;

  into.x = alpha * p.x - p.y * p.z;
  into.y = beta * p.y + p.x * p.z;
  into.z = gamma * p.z + (p.x * p.y) / 3.0;

  return into;
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

function monitor_ref(ref: MutableRefObject<any>) {
  return monitor(
    () => {
      if (typeof ref.current == "number") {
        return ref.current;
      }

      return JSON.stringify(
        ref.current,
        (key, value) => {
          if (typeof value == "number") {
            return value.toPrecision(3);
          } else {
            return value;
          }
        },
        "\n",
      );
    },
    { graph: false },
  );
}

const CustomGeometryParticles = (props: { count: number }) => {
  const { count } = props;

  // This reference gives us direct access to our points
  const points = useRef<THREE.Points>(null!);
  const material = useRef<THREE.PointsMaterial>(null!);
  const point_stats = useRef<PartStats>(empty_stats());
  const run_delta = useRef<number>(0);

  const { step_size, point_color } = useControls({
    point_color: "#5786F5",
    step_size: { value: 1e-1, min: 1e-3, max: 1, step: 1e-3 },
    delta: monitor_ref(run_delta),
    point_stats: monitor_ref(point_stats),
  });

  // Generate our positions attributes array
  const particlesPosition = useMemo(() => {
    const pos = Vec3Buffer.empty(count);
    const distance = 1;
    const point = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const theta = THREE.MathUtils.randFloatSpread(2 * Math.PI);
      const phi = THREE.MathUtils.randFloatSpread(2 * Math.PI);
      pos.set(
        i,
        point.set(
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

    const candidate = new THREE.Vector3();
    const point_guard = new PartGuard(1e3, () => {
      pos.get(THREE.MathUtils.randInt(0, pos.size), candidate);
      return candidate.addScaledVector(
        candidate,
        THREE.MathUtils.randFloatSpread(1e-2),
      );
    });

    const point = new THREE.Vector3();
    const dp_dt = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      pos.get(i, point);
      chen_lee(point, dp_dt);

      pos.set(
        i,
        point_guard.guard(point.addScaledVector(dp_dt, delta * step_size)),
      );
    }

    point_stats.current = point_guard.stats;

    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    // TODO: using ref=points here appears to cause errors with buffer attribute
    // regeneration under different counts
    <points ref={points} frustumCulled={false}>
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
        color={point_color}
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
        <CustomGeometryParticles count={0.2e6} />
        <ArcballControls />
      </Canvas>
      {diag_element}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App diag={import.meta.env.DEV} />,
);

addEventListener("click", function () {
  this.document.body.requestFullscreen();
});
