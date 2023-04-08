import React, { useRef, useState } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import ReactDOM from "react-dom/client";
import * as THREE from "three";

import "./main.css";

function Box(props: ThreeElements["mesh"]) {
    // This reference will give us direct access to the mesh
    const mesh = useRef<THREE.Mesh>(null!);

    // Set up state for the hovered and active state
    const [hovered, setHover] = useState(false);
    const [active, setActive] = useState(false);

    // Subscribe this component to the render-loop, rotate the mesh every frame
    useFrame((state, delta) => (mesh.current.rotation.x += delta));

    // Return view, these are regular three.js elements expressed in JSX
    return (
        <mesh
            {...props}
            ref={mesh}
            scale={active ? 2.0 : 1}
            onClick={(event) => setActive(!active)}
            onPointerOver={(event) => setHover(true)}
            onPointerOut={(event) => setHover(false)}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
        </mesh>
    );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
        <Canvas>
            <ambientLight />
            <pointLight position={[10, 10, 10]} />
            <Box position={[-1.2, 0, 0]} />
            <Box position={[1.2, 0, 0]} />
        </Canvas>
    </div>,
);
