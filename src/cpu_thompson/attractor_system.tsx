import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as attractors from "./attractors";

import { ArcballControls } from "@react-three/drei";
import { useControls, monitor } from "leva";

import { Diagnostics } from "../diagnostics";
import { Vec3Buffer } from "../vecbuffer";

interface VecIsh {
  x: number;
  y: number;
  z: number;
}
interface PartStats {
  count: number;
  resampled: number;
  max_mag: number;
}
function empty_stats(): PartStats {
  return { count: 0, resampled: 0, max_mag: 0 };
}

class PartGuard {
  static MAX_TRIES: number = 10;
  static SAMPLE_EPSILON: number = 1e-2;

  resampled: number = 0;

  mag_squared: number;
  max_mag_squared: number;

  resample_buf: THREE.Vector3;
  constructor(public mag_threshold: number, public sample_set: Vec3Buffer) {
    this.mag_squared = mag_threshold ** 2;
    this.max_mag_squared = 0;
    this.resample_buf = new THREE.Vector3();
  }

  guard(vec: THREE.Vector3): THREE.Vector3 {
    const lsquared = vec.lengthSq();

    // if (lsquared > this.max_mag_squared) {
    //   this.max_mag_squared = lsquared;
    // }

    if (lsquared < this.mag_squared) {
      return vec;
    }

    this.resampled += 1;

    for (var tries = 0; tries < PartGuard.MAX_TRIES; tries += 1) {
      const sample = this.sample_set.get(
        THREE.MathUtils.randInt(0, this.sample_set.size - 1),
        this.resample_buf,
      );

      if (sample.lengthSq() < this.max_mag_squared) {
        return sample.addScaledVector(
          sample,
          THREE.MathUtils.randFloatSpread(PartGuard.SAMPLE_EPSILON),
        );
      }
    }

    return vec;
  }

  stats(): PartStats {
    return {
      count: this.sample_set.size,
      resampled: this.resampled,
      max_mag: Math.sqrt(this.max_mag_squared),
    };
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

const CustomGeometryParticles = (
  props: PropsWithChildren<{
    count: number;
    attractor_fn: attractors.Attractor;
  }>,
) => {
  const { count, attractor_fn } = props;

  // This reference gives us direct access to our points
  const points = useRef<THREE.Points>(null!);
  const material = useRef<THREE.PointsMaterial>(null!);
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
    const point_guard = new PartGuard(1e3, pos);
    const point = new THREE.Vector3();
    const dp_dt = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      pos.get(i, point);
      attractor_fn(point, dp_dt);

      pos.set(
        i,
        point_guard.guard(point.addScaledVector(dp_dt, delta * step_size)),
      );
    }

    point_stats.current = point_guard.stats();
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
      {props.children}
    </points>
  );
};

export function AttractorSystem(props: {}) {
  const { point_color } = useControls({
    point_color: "#5786F5",
  });

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [25, 25, 60] }}>
        <ambientLight intensity={1} />
        <CustomGeometryParticles
          count={1024 * 1024}
          attractor_fn={attractors.thomas}
        >
          <pointsMaterial
            size={1}
            color={point_color}
            sizeAttenuation={false}
            blending={THREE.AdditiveBlending}
          />
        </CustomGeometryParticles>
        <ArcballControls />
      </Canvas>
      <Diagnostics />
    </div>
  );
}
