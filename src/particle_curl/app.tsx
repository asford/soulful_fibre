// @refresh reset

import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, RootState, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

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

const control_params = (params: any, defaults: any) => {
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
  const point_size = 1.0;

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

  useControls({
    reinit: button(() => {
      engine.init();
    }),
  });

  const uvs = useMemo((): Vec2Buffer => {
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

    return uvs;
  }, ["count"]);

  const engine = useMemo(() => {
    const compute = new MRTComputationRenderer(width, height, gl);

    const target = Vec4Buffer.empty(count);
    const vec4 = new THREE.Vector4();
    const uv = new THREE.Vector2();
    for (let i = 0; i < count; i++) {
      let t = uvs.get(i, uv).multiplyScalar(2.0).subScalar(1.0);

      target.set(i, vec4.set(t.x, t.y, Math.random() * 0.01, 1.0));
    }

    const init_target = compute.create_texture(target);

    const render_cycle = new MRTRenderCycle(
      compute,
      ["loc", "vel", "color", "target"],
      compute_init,
      as_uniforms({
        param_target: init_target,
      }),
      compute_step,
      as_uniforms({
        param_target: init_target,
        ...base_params,
      }),
    );

    render_cycle.init();

    return render_cycle;
  }, [count]);

  // https://github.com/mrdoob/three.js/blob/dev/examples/webgl_gpgpu_protoplanet.html
  const particle = useMemo(() => {
    // Positions are empty, we'll read from texture
    const positions = Vec3Buffer.empty(count);

    // UVs are index into texture buffers
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

    // here is where parameter updates could be defined
    // const param_target : THREE.DataTexture = engine.init_uniforms.param_target.value;

    // const tbuf = new Vec4Buffer(param_target.image.data);
    // let target = tbuf.get(0);

    // for (let index = 0; index < tbuf.size; index++) {
    //   target = tbuf.set(index, tbuf.get(index, target).multiplyScalar(.99));
    // }
    // param_target.needsUpdate = true;

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

import { GUI } from "dat.gui";

export function UnrealBloomOverlay() {
  var params = {
    luminanceThreshold: 0,
    luminanceSmoothing: 0.1,
    intensity: 2,
    radius: 0.05,
  };
  const cparams = useControls(
    control_params(_.pick(params, ["radius", "intensity"]), { min: 0, max: 4 }),
  );

  return (
    <EffectComposer>
      <Bloom 
        // @ts-expect-error
        mipmapBlur={true}
        {...params}
        {...cparams}
       />
    </EffectComposer>
  );
}
export function App(props: {}) {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [0.0, 0.0, 1.5] }}>
        <ParticlesFBO kpoints={512} />
          <mesh>
          <planeGeometry args={[10, 10]} />
          <meshBasicMaterial opacity={0.0} transparent={true} />
        </mesh>
        <ArcballControls />
        <UnrealBloomOverlay />
      </Canvas>
      <Diagnostics />
    </div>
  );
}

import { BloomEffect, KernelSize } from "postprocessing";
