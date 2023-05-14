// @refresh reset

// TODO cut inference rate for holistic to make room for compute buffer
// TODO reduce param update rate?
// TODO random particle re-init from core curl location? Maybe perturb by when under curl scale?
// TODO ramp curl scale by z for spin-effect on way in? Remap curl vector by displacement term?
// TODO pivot camera head position? random perturb?
import {
  HAND_CONNECTIONS,
  NormalizedLandmark,
  NormalizedLandmarkListList,
  POSE_CONNECTIONS,
  POSE_LANDMARKS,
  POSE_LANDMARKS_LEFT,
  POSE_LANDMARKS_RIGHT,
  POSE_LANDMARKS_NEUTRAL,
  FACEMESH_TESSELATION,
} from "@mediapipe/holistic";

import { PerspectiveCamera } from "@react-three/drei";
import {
  MutableRefObject,
  PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Canvas,
  RootState,
  ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

import p5 from "p5";

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
import _ from "underscore";

import { chakra_meta } from "../chakra_common";

import {
  default_video_constraints,
  HolisticCapture,
  CapResult,
} from "../holistic_capture";

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
const ParticlesFBO = (props: {
  kpoints: number;
  // GOD DAMN IT, should move back into something else as state?
  callbacks: MutableRefObject<{
    reinit: () => void;
    fade_out: () => void;
    spawn: (point: THREE.Vector3, color: THREE.Color) => void;
  }>;
}) => {
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
        delta: 1.0,
        f_disp: 3.0,
        f_curl: 0.2,
        curl_scale: 0.01,
        curl_p: 0.0,
        init_center: new THREE.Vector3(0, 0, 0),
        init_radius: 2.0,
        init_vel_scale: 0.05,
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
    fade_out: button(() => {
      fade_out();
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
      p_target: compute.create_texture(),
      p_hsv_color: compute.create_texture(),
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
      const rotation = Math.random() * 2 * Math.PI;
      const rad = 4.0;
      vec2.set(rad, 0).rotateAround(zz, rotation);
      const hue = Math.abs((vec2.y + rad) / (2*rad));
      target.set(i, vec4.set(vec2.x, vec2.y, 8, base_params.init_vel_scale));
      // target.set(i, vec4.set(0.0, 0.0, 2.0, 0.0));
      hsv_color.set(i, vec4.set(hue * .85, 1.0, 0.5, 0.0));

      // let t = uvs.get(i, uv).multiplyScalar(2.0).subScalar(1.0);
      // target.set(i, vec4.set(t.x, t.y, Math.random() * 0.01, 1.0));
    }

    param.current.p_target.needsUpdate = true;
    param.current.p_hsv_color.needsUpdate = true;

    engine.init();
  };

  const fade_out = () => {
    cur_idx.current = 0;

    const target = new Vec4Buffer(param.current.p_target.image.data);
    const hsv_color = new Vec4Buffer(param.current.p_hsv_color.image.data);
    const vec4 = new THREE.Vector4();
    const vec3 = new THREE.Vector3();
    const vec2 = new THREE.Vector2();
    const uv = new THREE.Vector2();
    const zz = new THREE.Vector2(0, 0);

    for (let i = 0; i < count; i++) {
      target.get(i, vec4);
      vec4.x = vec4.x + (Math.random() - .5 ) * .5;
      vec4.y = vec4.y + (Math.random() - .5 ) * .5;
      vec4.z = 20;
      vec4.w = .05;
      target.set(i, vec4);
    }

    param.current.p_target.needsUpdate = true;
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

  const MAX_DELTA = 1./5.;
  useFrame((state: RootState, delta: number) => {
    // Clamp step size
    if (delta > MAX_DELTA ) {
      delta = MAX_DELTA;
    }

    update_uniforms(engine.init_uniforms, {
      ...base_params,
      delta: delta * base_params.delta,
    });
    update_uniforms(engine.compute_uniforms, {
      ...base_params,
      delta: delta * base_params.delta,
    });

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

  const spawn_with_color = (spawn_point: THREE.Vector3, color: THREE.Color) => {
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

    const hue = color.getHSL({ h: 0, s: 0, l: 0 }).h;
    console.log("spawn_with_color", spawn_point, hue);

    for (let i = offset; i < final; i += mats.length) {
      for (let j = 0; j < mats.length; j++) {
        const mat = mats[j];
        vec3
          .randomDirection()
          .multiplyScalar(Math.random() * 0.01)
          .add(spawn_point)
          .applyMatrix3(mat);

        target.set(i + j, vec4.set(vec3.x, vec3.y, vec3.z * 0.1, 1.0));
        hsv_color.set(i + j, vec4.set(hue, 1.0, 0.5, 0.0));
      }
    }
    param.current.p_target.needsUpdate = true;
    param.current.p_hsv_color.needsUpdate = true;
    cur_idx.current = final;
  };

  // Horrid, push callbacks into calling frame
  props.callbacks.current = {
    reinit: reinit,
    fade_out: fade_out,
    spawn: spawn_with_color,
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
    </>
  );
};

import { GUI } from "dat.gui";
import { VecIsh } from "../diagnostic_view/vector";

export function UnrealBloomOverlay() {
  var params = {
    luminanceThreshold: 0,
    luminanceSmoothing: 0.1,
    intensity: 4,
    radius: 0.7,
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
  const cap_video = useRef<HTMLVideoElement>(null!);
  const holistic = useRef<HolisticCapture>(new HolisticCapture());
  const fbo_callbacks = useRef<{
    reinit: () => void;
    fade_out: () => void;
    spawn: (point: THREE.Vector3, color: THREE.Color) => void;
  }>(null!);

  const clickmesh = useRef<THREE.Mesh>(null!);

  const draw_params = useControls(
    control_params(
      {
        draw_canvas_scale: 1.5,
      },
      { min: 0.1, max: 5 },
    ),
  );

  const cap = useEffect(() => {
    console.log("get_user_media");
    navigator.mediaDevices
      .getUserMedia(default_video_constraints())
      .then(function (stream) {
        cap_video.current.srcObject = stream;
        holistic.current.attach_video(cap_video.current);
        holistic.current.on_result(on_result);
      }, console.log);
  }, []);

  const on_result = (current: CapResult, prev?: CapResult): void => {
    console.log("on_result", current, prev);

    if (
      (current.result?.poseLandmarks && !prev?.result?.poseLandmarks)
    ) {
      console.log("reinit");
      fbo_callbacks.current.reinit();
    }

    if (
      (prev?.result?.poseLandmarks && !current.result?.poseLandmarks)
    ) {
      console.log("fade_out");
      fbo_callbacks.current.fade_out();
    }

    var right_index: p5.Vector | undefined = undefined;
    var spawn_point: THREE.Vector3 | undefined = undefined;
    var left_index: p5.Vector | undefined = undefined;

    function v(p: VecIsh) {
      return new p5.Vector(p.x, p.y);
    }

    if (current.result?.rightHandLandmarks) {
      right_index = v(current.result.rightHandLandmarks[8]);
      // TODO map into internl frame
      const right_loc = new THREE.Vector2(right_index.x, right_index.y)
        .subScalar(0.5)
        .multiplyScalar(2 * draw_params.draw_canvas_scale)
        .multiplyScalar(-1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(right_loc, camera.current);
      const intersects = raycaster.intersectObject(clickmesh.current);

      if (intersects[0]) {
        spawn_point = intersects[0].point;
      }
    }

    if (spawn_point) {
      finger_sphere.current.position.set(
        spawn_point.x,
        spawn_point.y,
        spawn_point.z,
      );
    } else {
      // Move sphere out of display
      finger_sphere.current.position.set(0, 0, 100);
    }

    var pose_coords;
    if (current.result?.poseLandmarks) {
      pose_coords = _.mapObject(POSE_LANDMARKS, (idx: number, name: string) => {
        const landmark = current.result?.poseLandmarks[idx];
        if (!landmark) {
          return new p5.Vector(NaN, NaN);
        } else {
          return new p5.Vector(landmark.x, landmark.y);
        }
      });
      left_index = pose_coords.LEFT_INDEX;
    }

    // console.log("on_result", right_index, spawn_point, left_index);

    if (right_index && left_index && pose_coords) {
      const chak = chakra_meta(pose_coords, right_index, left_index);
      console.log("chak", chak);

      if (spawn_point && chak.left.activated) {
        // @ts-expect-error
        const chak_color = new THREE.Color(chak.left.color);
        fbo_callbacks.current.spawn(spawn_point, chak_color);
      }
    }
  };

  // Raycast from NDC space into
  // const spawn = (ndc_point: THREE.Vector2): void => {
  //   ndc_point.multiplyScalar(2.0);
  //   console.log(ndc_point);
  //   const raycaster = new THREE.Raycaster();
  //   raycaster.setFromCamera(ndc_point, camera.current);
  //   const intersects = raycaster.intersectObject(clickmesh.current);

  //   if (!intersects[0]) {
  //     return;
  //   }
  //   const spawn_point = intersects[0].point;
  //   spawn_callback.current(spawn_point);
  //   finger_sphere.current.position.set(
  //     spawn_point.x,
  //     spawn_point.y,
  //     spawn_point.z,
  //   );
  // };

  const finger_sphere = useRef<THREE.Mesh>(null!);
  const camera = useRef<THREE.Camera>(null!);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <video ref={cap_video} hidden={true} autoPlay />

      <Canvas>
        <PerspectiveCamera ref={camera} position={[0.0, 0.0, 5]} />
        <ParticlesFBO kpoints={256} callbacks={fbo_callbacks} />
        <ArcballControls />
        <UnrealBloomOverlay />
        <mesh ref={clickmesh} onClick={(click) => console.log(click.pointer)}>
          <planeGeometry args={[20, 20]} />
          <meshBasicMaterial opacity={0.001} transparent={true} />
        </mesh>
        <mesh ref={finger_sphere}>
          <sphereGeometry args={[0.01, 24, 24]} />
          <meshStandardMaterial emissive={new THREE.Color(200, 200, 200)} />
        </mesh>
      </Canvas>
      <Diagnostics show={true} />
    </div>
  );
}
