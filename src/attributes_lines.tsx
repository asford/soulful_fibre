import { Line, OrbitControls, Stats } from "@react-three/drei";
import { useControls, Leva } from "leva";
import { ArcballControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ReactDOM, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
} from "three";
import { Diagnostics } from "./diagnostics";
import { Box } from "./box";
import { NumberSettings } from "leva/dist/declarations/src/types";
import _ from "underscore";
import { Vec3Buffer, complexify_path } from "./vecbuffer";

import THREE from "three";

class Idx2d {
  stride_0: number;
  stride_1: number;
  size: number;

  constructor(public shape_0: number, public shape_1: number) {
    this.stride_0 = shape_1;
    this.stride_1 = 1;
    this.size = this.shape_0 * this.shape_1;
  }

  public idx(idx_0: number, idx_1: number): number {
    return idx_0 * this.stride_0 + idx_1 * this.stride_1;
  }
}

// Pulsing kernel @ 15/.02
// Weird surface @ 10/.07
export function HairyBall() {
  const num_lines = 3000;
  const line_length = 2 ** 5;
  const lshape = new Idx2d(num_lines, line_length + 1);

  const { u_ldev, rad } = useControls({
    u_ldev: 2,
    rad: { value: 0.02, min: 0, max: 2, step: 0.01 },
  });

  const line_initial = useMemo(() => {
    const vbuf = Vec3Buffer.empty(lshape.size);

    const work = new Vector3();
    const identity = new Quaternion().identity();
    const rot = new Quaternion();

    for (var i = 0; i < num_lines; i++) {
      const si = lshape.idx(i, 0);
      const ei = lshape.idx(i, line_length - 1);

      vbuf.set(si, work.randomDirection());
      rot.random().slerp(identity, 0.6);
      vbuf.set(ei, work.multiplyScalar(rad).applyQuaternion(rot));
      vbuf.set(ei + 1, work.set(NaN, NaN, NaN));

      complexify_path(vbuf, si, ei, u_ldev / 1000);
    }

    return vbuf.data;
  }, [rad]);

  useFrame((state, delta) => {
    const vbuf = Vec3Buffer.view(
      // @ts-expect-error
      lines.current.geometry.attributes.position.array,
    );

    const work = new Vector3();
    const identity = new Quaternion().identity();
    const rot = new Quaternion();

    for (var i = 0; i < num_lines; i++) {
      const si = lshape.idx(i, 0);
      const ei = lshape.idx(i, line_length - 1);

      rot.random().slerp(identity, 0.998);
      vbuf.set(si, vbuf.get(si, work).applyQuaternion(rot));

      rot.random().slerp(identity, 0.998);
      vbuf.set(ei, vbuf.get(ei, work).applyQuaternion(rot));
      vbuf.set(ei + 1, work.set(NaN, NaN, NaN));
      vbuf.set(ei + 1, work.set(0, 0, 0));

      complexify_path(vbuf, si, ei, u_ldev / 1000);
    }

    lines.current.geometry.attributes.position.needsUpdate = true;
  });

  const lines = useRef<THREE.Points>(null!);
  //   useFrame((state, delta) => {});
  return (
    <points ref={lines}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={lshape.size}
          array={line_initial}
          itemSize={3}
        />
      </bufferGeometry>
      {/* <lineBasicMaterial color="white" blending={AdditiveBlending} /> */}
      <pointsMaterial
        size={0.5}
        sizeAttenuation={false}
        color="white"
        blending={AdditiveBlending}
      />
    </points>
  );
}

export function AttributesLines() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Diagnostics />
      <Canvas camera={{ position: [1, 1, 1] }}>
        <OrbitControls autoRotate={true} autoRotateSpeed={1} />
        <ambientLight intensity={1} />
        <HairyBall />
      </Canvas>
    </div>
  );
}
