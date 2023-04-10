import { MutableRefObject, PropsWithChildren, useMemo, useRef } from "react";
import { Canvas, RootState, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as attractors from "./attractors";

import { ArcballControls } from "@react-three/drei";
import { useControls, monitor } from "leva";

import { Diagnostics } from "./diagnostics";
import { Vec3Buffer } from "./vecbuffer";
import { GPUComputationRenderer } from "./GPUComputationRenderer";

import particles_frag from "./particles.frag";
import particles_vert from "./particles.vert";

const ParticlesFBO = (props: { radius: number }) => {
  const gl = useThree((state) => state.gl);
  const width = 1024;
  const height = 1024;
  const count = width * height;

  const engine = useMemo(() => {
    const compute = new GPUComputationRenderer(width, height, gl);
    const buf = new THREE.Vector4();

    const initial_position = compute.createTexture();
    const initial_color = compute.createTexture();

    const point = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      point.randomDirection();
      color.setHSL(Math.abs(point.x), 1.0, 0.5);

      buf.set(point.x, point.y, point.z, 1.0);
      buf.toArray(initial_position.image.data, i * 4);

      buf.set(color.r, color.g, color.b, 1.0);
      buf.toArray(initial_color.image.data, i * 4);
    }

    // just passthrough on render
    const positions = compute.addVariable(
      "positions",
      `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            gl_FragColor = texture2D(positions, uv);
        }
      `,
      initial_position,
    );

    const colors = compute.addVariable(
      "colors",
      `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            gl_FragColor = texture2D(colors, uv);
        }
      `,
      initial_color,
    );

    compute.setVariableDependencies(positions, [positions]);
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
    var positions = new Float32Array(count * 3);

    // UVs are index into texture buffers
    var uvs = new Float32Array(count * 2);
    const num_x = width;
    const num_y = height;
    var p = 0;
    for (var x = 0; x < num_x; x++) {
      for (var y = 0; y < num_y; y++) {
        uvs[p++] = x / (num_x - 1);
        uvs[p++] = y / (num_y - 1);
      }
    }

    const geometry = (
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-uv"
          count={count}
          array={uvs}
          itemSize={2}
        />
      </bufferGeometry>
    );

    const uniforms = {
      texture_position: { value: null },
      texture_color: { value: null },
      point_size: { value: 1.0 },
    };

    return {
      geometry: geometry,
      uniforms: uniforms,
    };
  }, [count]);

  function read_variable(variable): Float32Array {
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
        blending={THREE.AdditiveBlending}
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
        <ParticlesFBO />
        <ArcballControls />
      </Canvas>
      <Diagnostics />
    </div>
  );
}
