import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, RootState, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { ArcballControls } from "@react-three/drei";
import { useControls, monitor, button } from "leva";

import { Diagnostics } from "../diagnostics";
import {
  as_uniforms,
  MRTComputationRenderer,
  MRTRenderCycle,
  update_uniforms,
} from "../MRTGPGPU";

import particles_frag from "./particles.frag";
import particles_vert from "./particles.vert";
import compute_init from "./compute_init.glsl";
import compute_step from "./compute_step.glsl";

import { Vec4Buffer, Vec3Buffer, Vec2Buffer } from "../vecbuffer";
import _, { min } from "underscore";
import { movingAverage } from "@tensorflow/tfjs";

const control_params = (params, defaults) => {
  return _.mapObject(params, (val, name) => {
    return { value: val, ...defaults };
  });
};

const ParticlesFBO = (props: { kpoints: number }) => {
  const gl = useThree((state) => state.gl);
  const { kpoints } = props;

  const count = kpoints * 1024;
  const width = 1024;
  const height = count / width;
  const point_size = 2.0;

  if (count % width != 0) {
    throw new Error(
      `Count must be even multiple of ${width} for compute pass.`,
    );
  }
  const base_params = useControls(
    control_params(
      {
        f_disp: 0.3,
        f_curl: 0.1,
        curl_scale: 0.5,
        curl_p: 0.0,
      },
      { min: -1, max: 1 },
    ),
  );

  const engine = useMemo(() => {
    const compute = new MRTComputationRenderer(width, height, gl);

    const init_loc = Vec4Buffer.empty(count);
    const init_color = Vec4Buffer.empty(count);

    const point = new THREE.Vector3();
    const color = new THREE.Color();
    const vec4 = new THREE.Vector4();

    for (let i = 0; i < count; i++) {
      point.randomDirection();
      init_loc.set(i, vec4.set(point.x, point.y, point.z, 1.0));

      color.setHSL(Math.abs(point.x), 1.0, 0.5);
      init_color.set(i, vec4.set(color.r, color.g, color.b, 1.0));
    }

    const render_cycle = new MRTRenderCycle(
      compute,
      ["loc", "vel", "color", "target"],
      compute_init,
      {},
      compute_step,
      as_uniforms(base_params),
    );

    render_cycle.init();

    return render_cycle;
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

    const uniforms = {
      point_size: { value: point_size },
      ...engine.texture_uniforms(),
    };

    return {
      positions: positions,
      uvs: uvs,
      uniforms: uniforms,
    };
  }, [count]);

  const points = useRef<THREE.Points>(null!);
  const material = useRef<THREE.ShaderMaterial>(null!);

  useFrame((state, delta) => {
    update_uniforms(engine.compute_uniforms, base_params);

    _.each(
      {
        ...engine.texture_uniforms(),
      },
      (update, name) => {
        material.current.uniforms[name].value = update.value;
      },
    );

    engine.render();
  });

  return (
    // TODO: using ref=points here appears to cause errors with buffer attribute
    // regeneration under different counts
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particle.positions.size}
          array={particle.positions.data}
          itemSize={particle.positions.itemsize}
        />
        <bufferAttribute
          attach="attributes-uv"
          count={particle.uvs.size}
          array={particle.uvs.data}
          itemSize={particle.uvs.itemsize}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        // blending={THREE.AdditiveBlending}
        depthWrite={true}
        fragmentShader={particles_frag}
        vertexShader={particles_vert}
        uniforms={particle.uniforms}
      />
    </points>
  );
};

export function App(props: {}) {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [0.0, 0.0, 1.5] }}>
        <ParticlesFBO kpoints={512} />
        <mesh
          onClick={(e) => {
            console.log("click", e.point.toArray());
          }}
        >
          <planeGeometry args={[10, 10]} />
          <meshBasicMaterial opacity={0.01} transparent={true} />
        </mesh>
        <ArcballControls />
      </Canvas>
      <Diagnostics />
    </div>
  );
}
