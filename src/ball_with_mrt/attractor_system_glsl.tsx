import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, RootState, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as attractors from "../cpu_thompson/attractors";

import { ArcballControls } from "@react-three/drei";
import { useControls, monitor } from "leva";

import { Diagnostics } from "../diagnostics";
import { MRTComputationRenderer, MRTRenderCycle } from "../MRTGPGPU";

import particles_frag from "./particles.frag";
import particles_vert from "./particles.vert";
import compute_init from "./compute_init.glsl";
import compute_step from "./compute_step.glsl";

import { Vec4Buffer, Vec3Buffer, Vec2Buffer } from "../vecbuffer";
import { render } from "react-dom";

const ParticlesFBO = (props: { count: number }) => {
  const gl = useThree((state) => state.gl);
  const { count } = props;
  const width = 1024;
  const height = count / width;

  if (count % width != 0) {
    throw new Error(
      `Count must be even multiple of ${width} for compute pass.`,
    );
  }

  const { m_force, m_step_size } = useControls({
    m_force: { value: 1000, min: 0, max: 10e3 },
    m_step_size: { value: 1000, min: 0, max: 10e3 },
  });

  const engine = useMemo(() => {
    const compute = new MRTComputationRenderer(width, height, gl);

    const init_loc = Vec4Buffer.empty(count);
    const init_color = Vec4Buffer.empty(count);

    const point = new THREE.Vector3();
    const color = new THREE.Color();
    const vec4 = new THREE.Vector4();

    for (let i = 0; i < count; i++) {
      point.randomDirection();
      init_loc.set(
        i,
        vec4
          .set(point.x, point.y, point.z, 1.0)
          .multiplyScalar(THREE.MathUtils.randFloat(0.01, 1)),
      );

      color.setHSL(Math.abs(point.x), 1.0, 0.5);
      init_color.set(i, vec4.set(color.r, color.g, color.b, 1.0));
    }

    const render_cycle = new MRTRenderCycle(
      compute,
      ["loc", "vel", "color"],
      compute_init,
      {
        init_loc: {
          value: compute.create_texture(init_loc.data as Float32Array),
        },
        init_color: {
          value: compute.create_texture(init_color.data as Float32Array),
        },
      },
      compute_step,
      {
        delta: { value: 0 },
        force: { value: 0 },
      },
    );

    return {
      compute: compute,
      render_cycle: render_cycle,
    };
  }, [count]);

  // https://github.com/mrdoob/three.js/blob/dev/examples/webgl_gpgpu_protoplanet.html
  const particle = useMemo(() => {
    // Positions are empty, we'll read from texture
    const positions = Vec3Buffer.empty(count);

    // UVs are index into texture buffers
    const uvs = Vec2Buffer.empty(count);
    const uv = new THREE.Vector2();
    const num_x = width;
    const num_y = height;
    var i = 0;
    for (var x = 0; x < num_x; x++) {
      for (var y = 0; y < num_y; y++) {
        uvs.set(i, uv.set(x / (num_x - 1), y / (num_y - 1)));
        i++;
      }
    }

    const geometry = (
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.size}
          array={positions.data}
          itemSize={positions.itemsize}
        />
        <bufferAttribute
          attach="attributes-uv"
          count={uvs.size}
          array={uvs.data}
          itemSize={uvs.itemsize}
        />
      </bufferGeometry>
    );

    const uniforms = {
      point_size: { value: 1.0 },
      ...engine.render_cycle.texture_uniforms(),
    };

    return {
      geometry: geometry,
      uniforms: uniforms,
    };
  }, [count]);

  const points = useRef<THREE.Points>(null!);

  useFrame((state, delta) => {
    engine.render_cycle.compute_uniforms.delta.value =
      (delta * m_step_size) / 1000;
    engine.render_cycle.compute_uniforms.force.value = m_force / 1000;

    engine.render_cycle.render();

    particle.uniforms = {
      ...particle.uniforms,
      ...engine.render_cycle.texture_uniforms(),
    };
  });

  return (
    // TODO: using ref=points here appears to cause errors with buffer attribute
    // regeneration under different counts
    <points ref={points} frustumCulled={false}>
      {particle.geometry}
      <shaderMaterial
        // blending={THREE.AdditiveBlending}
        depthWrite={false}
        fragmentShader={particles_frag}
        vertexShader={particles_vert}
        uniforms={particle.uniforms}
      />
    </points>
  );
};

export function AttractorSystemGLSL(props: {}) {
  const k_points = 1024 * 2;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [0.5, 0.5, 0.5] }}>
        <ambientLight intensity={1} />
        <ParticlesFBO count={k_points * 1024} />
        <ArcballControls />
      </Canvas>
      <Diagnostics />
    </div>
  );
}
