import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, RootState, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as attractors from "../cpu_thompson/attractors";

import { ArcballControls } from "@react-three/drei";
import { useControls, monitor } from "leva";

import { Diagnostics } from "../diagnostics";
import {
  GPUComputationRenderer,
  GPUComputationRendererVariable,
} from "../GPUComputationRenderer";

import particles_frag from "./particles.frag";
import particles_vert from "./particles.vert";

import { Vec4Buffer, Vec3Buffer, Vec2Buffer } from "../vecbuffer";

const ParticlesFBO = (props: { count: number }) => {
  const gl = useThree((state) => state.gl);
  const { count } = props;
  const width = 1024;
  const height = count / width;

  if (count % width != 0) {
    throw new Error("Count must be even multiple of 1024 for compute pass.");
  }

  const engine = useMemo(() => {
    const compute = new GPUComputationRenderer(width, height, gl);

    const initial_position = Vec4Buffer.empty(count);
    const initial_velocity = Vec4Buffer.empty(count);
    const initial_color = Vec4Buffer.empty(count);

    const point = new THREE.Vector3();
    const color = new THREE.Color();
    const vec4 = new THREE.Vector4();

    for (let i = 0; i < count; i++) {
      point.randomDirection();
      initial_position.set(i, vec4.set(point.x, point.y, point.z, 1.0));

      color.setHSL(Math.abs(point.x), 1.0, 0.5);
      initial_color.set(i, vec4.set(color.r, color.g, color.b, 1.0));
    }

    // just passthrough on render
    const velocities = compute.addVariable(
      "velocities",
      `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;

            vec4 origin = vec4(0, 0, 0, 0);
            vec4 position = texture2D(positions, uv);
            vec4 velocity = texture2D(velocities, uv);
            vec4 displacement = origin - position;

            gl_FragColor = velocity + displacement * .001;
        }
      `,
      compute.createTexture(initial_velocity.data as Float32Array),
    );

    const positions = compute.addVariable(
      "positions",
      `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec4 position = texture2D(positions, uv);
            vec4 velocity = texture2D(velocities, uv);

            gl_FragColor = position + velocity * .001;
        }
      `,
      compute.createTexture(initial_position.data as Float32Array),
    );

    compute.setVariableDependencies(velocities, [positions, velocities]);
    compute.setVariableDependencies(positions, [positions, velocities]);

    const colors = compute.addVariable(
      "colors",
      `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            gl_FragColor = texture2D(colors, uv);
        }
      `,
      compute.createTexture(initial_color.data as Float32Array),
    );
    compute.setVariableDependencies(colors, [colors]);

    var error = compute.init();
    if (error !== null) {
      console.error(error);
    }

    return {
      compute: compute,
      positions: positions,
      colors: colors,
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
      texture_position: { value: engine.positions.initialValueTexture },
      texture_color: { value: engine.colors.initialValueTexture },
      point_size: { value: 1.0 },
    };

    return {
      geometry: geometry,
      uniforms: uniforms,
    };
  }, [count]);

  function read_variable(
    variable: GPUComputationRendererVariable,
  ): Float32Array {
    const var_target: THREE.WebGLRenderTarget =
      engine.compute.getCurrentRenderTarget(variable);
    const num_x = var_target.texture.source.data.width;
    const num_y = var_target.texture.source.data.height;
    const result = new Float32Array(num_x * num_y * 4);
    gl.readRenderTargetPixels(var_target, 0, 0, num_x, num_y, result);

    return result;
  }

  const points = useRef<THREE.Points>(null!);

  useFrame((state) => {
    engine.compute.compute();

    particle.uniforms.texture_position.value =
      engine.compute.getCurrentRenderTarget(engine.positions).texture;

    particle.uniforms.texture_color.value =
      engine.compute.getCurrentRenderTarget(engine.colors).texture;
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
  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <Canvas camera={{ position: [0.5, 0.5, 0.5] }}>
        <ambientLight intensity={1} />
        <ParticlesFBO count={1024 * 1024} />
        <ArcballControls />
      </Canvas>
      <Diagnostics />
    </div>
  );
}
