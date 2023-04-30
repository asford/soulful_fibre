import * as THREE from "three";
import { useRef } from "react";
import { extend, Canvas, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";

import vertex from "./vertex.glsl";
import fragment from "./fragment.glsl";
import _ from "underscore";

interface HasUniforms {
  uniforms: { [name: string]: THREE.IUniform };
  uniformsNeedUpdate: boolean;
}

function as_uniforms(uniforms: { [name: string]: any }) {
  return _.mapObject(uniforms, (val, name) => {
    return { value: val };
  });
}

function update_uniforms(object: HasUniforms, update: { [name: string]: any }) {
  _.extend(object.uniforms, as_uniforms(update));
  object.uniformsNeedUpdate = true;
}

const Sketch = () => {
  const mesh = useRef<THREE.Mesh>(null!);
  const material = useRef<THREE.ShaderMaterial>(null!);

  const uniforms = {
    uTime: 0.0,
    uResolution: new THREE.Vector2(600, 600),
  };

  useFrame(({ clock }) => {
    update_uniforms(material.current, { uTime: clock.elapsedTime });
  });

  return (
    <mesh ref={mesh}>
      <planeBufferGeometry args={[10, 10, 1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={as_uniforms(uniforms)}
        fragmentShader={fragment}
        vertexShader={vertex}
      />
    </mesh>
  );
};

export function App() {
  return (
    <Canvas style={{ width: "600px", height: "600px" }}>
      <Sketch />
    </Canvas>
  );
}
