// @refresh reset

import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import {
  Canvas,
  RootState,
  ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

import * as THREE from "three";
import * as d3 from "d3";

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

const symmetric_matrices = () => {
  var result = [];
  const n = 8;
  // https://en.wikipedia.org/wiki/Dihedral_group
  for (let k = 0; k < n; k++) {
    result.push(
      new THREE.Matrix3().fromArray(
        _.flatten([
          [
            Math.cos((2 * Math.PI * k) / n),
            -Math.sin((2 * Math.PI * k) / n),
            0.0,
          ],
          [
            Math.sin((2 * Math.PI * k) / n),
            Math.cos((2 * Math.PI * k) / n),
            0.0,
          ],
          [0.0, 0.0, 1.0],
        ]),
      ),
      new THREE.Matrix3().fromArray(
        _.flatten([
          [
            Math.cos((2 * Math.PI * k) / n),
            Math.sin((2 * Math.PI * k) / n),
            0.0,
          ],
          [
            Math.sin((2 * Math.PI * k) / n),
            -Math.cos((2 * Math.PI * k) / n),
            0.0,
          ],
          [0.0, 0.0, 1.0],
        ]),
      ),
    );
  }
  return result;
};

const ParticlesFBO = (props: { kpoints: number }) => {
  const gl = useThree((state) => state.gl);
  const { kpoints } = props;

  const count = kpoints * 1024;
  const width = 1024;
  const height = count / width;
  const point_size = 3.0;

  if (count % width != 0) {
    throw new Error(
      `Count must be even multiple of ${width} for compute pass.`,
    );
  }
  const base_params = useControls(
    control_params(
      {
        f_disp: 3.0,
        f_curl: 0.2,
        curl_scale: 0.01,
        curl_p: 0.0,
        init_center: new Vector3(0, 0, 0),
        init_radius: 3.0,
        spawn_count: 100,
        spawn_radius: 0.01,
      },
      { min: -1, max: 10 },
    ),
  );

  useControls({
    reinit: button(() => {
      reinit();
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

  const param = useRef<{
    p_target: THREE.DataTexture;
    p_hsv_color: THREE.DataTexture;
  }>(null!);
  const cur_idx = useRef<number>(0);

  const engine = useMemo(() => {
    const compute = new MRTComputationRenderer(width, height, gl);

    param.current = {
      p_target : compute.create_texture(),
      p_hsv_color : compute.create_texture(),
    };

    const render_cycle = new MRTRenderCycle(
      compute,
      ["loc", "vel", "color", "target"],
      compute_init,
      as_uniforms({
        ...param.current,
        ...base_params,
      }),
      compute_step,
      as_uniforms({
        ...param.current,
        ...base_params,
      }),
    );

    render_cycle.init();

    return render_cycle;
  }, [count]);

  const reinit = () => {
    cur_idx.current = 0;

    const target = new Vec4Buffer(param.current.p_target.image.data);
    const hsv_color = new Vec4Buffer(param.current.p_hsv_color.image.data);
    const vec4 = new THREE.Vector4();
    const vec3 = new THREE.Vector3();
    const vec2 = new THREE.Vector2();
    const uv = new THREE.Vector2();
    const zz = new THREE.Vector2(0, 0);

    for (let i = 0; i < count; i++) {
      vec2.set(0.5, 0).rotateAround(zz, Math.random() * 100);
      target.set(i, vec4.set(vec2.x, vec2.y, 1.5, 0.0));
      // target.set(i, vec4.set(0.0, 0.0, 2.0, 0.0));
      hsv_color.set(i, vec4.set((i / count) * 0.85, 1.0, 0.5, 0.0));

      // let t = uvs.get(i, uv).multiplyScalar(2.0).subScalar(1.0);
      // target.set(i, vec4.set(t.x, t.y, Math.random() * 0.01, 1.0));
    }

    param.current.p_target.needsUpdate = true;
    param.current.p_hsv_color.needsUpdate = true;

    engine.init();
  };

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
    update_uniforms(engine.init_uniforms, base_params);
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
  const spawn = (click: ThreeEvent<MouseEvent>) => {
    // console.log("spawn", click.point, click.pointer);

    const target = new Vec4Buffer(param.current.p_target.image.data);
    const hsv_color = new Vec4Buffer(param.current.p_hsv_color.image.data);

    const offset = cur_idx.current;
    const mats = symmetric_matrices();

    const final = Math.min(
      base_params.spawn_count * mats.length + offset,
      count,
    );

    const vec3 = new THREE.Vector3();
    const vec4 = new THREE.Vector4();

    for (let i = offset; i < final; i += mats.length) {
      for (let j = 0; j < mats.length; j++) {
        const mat = mats[j];
        vec3
          .randomDirection()
          .multiplyScalar(Math.random() * 0.01)
          .add(click.point)
          .applyMatrix3(mat);

        target.set(i + j, vec4.set(vec3.x, vec3.y, vec3.z * 0.1, 0.0));
        hsv_color.set(i + j, vec4.set((vec3.x % 1.0) * 0.85, 1.0, 0.5, 0.0));
      }
    }
    param.current.p_target.needsUpdate = true;
    param.current.p_hsv_color.needsUpdate = true;
    cur_idx.current = final;
  };

  return (
    <>
      // TODO: using ref=points here appears to cause errors with buffer
      attribute // regeneration under different counts
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
      <mesh onPointerMove={spawn}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial opacity={0.001} transparent={true} />
      </mesh>
    </>
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
        <ParticlesFBO kpoints={1024} />
        <ArcballControls />
        <UnrealBloomOverlay />
      </Canvas>
      <Diagnostics />
    </div>
  );
}

import { BloomEffect, KernelSize } from "postprocessing";
import { Vector3 } from "three";
import { copyTextureToTexturePixelShader } from "@babylonjs/core/Shaders/copyTextureToTexture.fragment";
