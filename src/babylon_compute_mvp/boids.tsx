import { Engine, Scene } from "@babylonjs/core";
import * as BABYLON from "@babylonjs/core";
import SceneComponent from "./babylonjs-hook";
import { useRef } from "react";

export function App() {
  const boids = useRef<Boid>(null!);

  const onSceneReady = (scene: Scene) => {
    const engine = scene.getEngine();

    var camera = new BABYLON.ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 2,
      10,
      BABYLON.Vector3.Zero(),
      scene,
    );

    camera.setTarget(BABYLON.Vector3.Zero());

    if (!scene.getEngine().getCaps().supportComputeShaders) {
      const engine = scene.getEngine();
      console.error("Compute shaders not supported.", engine, engine.getCaps());
      throw Error("Scene does not support compute shaders.");
    }

    boids.current = new Boid(1000, simParams, scene);

    // Create a bloom overlay
    var standardPipeline = new BABYLON.PostProcessRenderPipeline(
      engine,
      "standardPipeline",
    );

    var bloom = new BABYLON.BloomEffect(scene, 1, 5, 15);
    bloom.threshold = 0.05;
    standardPipeline.addEffect(bloom);

    // Add pipeline to the scene's manager and attach to the camera
    scene.postProcessRenderPipelineManager.addPipeline(standardPipeline);
    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
      "standardPipeline",
      camera,
    );
  };

  /**
   * Will run on every frame render.  We are spinning the box on y-axis.
   */
  const onRender = (scene: Scene) => {
    boids.current.update();
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        overflow: "clip",
      }}
    >
      <SceneComponent
        id="my-canvas"
        style={{ width: "100vw", height: "100vh" }}
        webGPU
        onSceneReady={onSceneReady}
        onRender={onRender}
      />
    </div>
  );
}

interface SimParams {
  deltaT: number;
  rule1Distance: number;
  rule2Distance: number;
  rule3Distance: number;
  rule1Scale: number;
  rule2Scale: number;
  rule3Scale: number;
}

const simParams: SimParams = {
  deltaT: 0.04,
  rule1Distance: 0.1,
  rule2Distance: 0.025,
  rule3Distance: 0.025,
  rule1Scale: 0.02,
  rule2Scale: 0.05,
  rule3Scale: 0.005,
};

class Boid {
  numParticles: number;
  simParams: BABYLON.UniformBuffer;
  particleBuffers: BABYLON.StorageBuffer[];
  vertexBuffers: BABYLON.VertexBuffer[][];
  mesh: BABYLON.Mesh;

  cs1: BABYLON.ComputeShader;
  cs2: BABYLON.ComputeShader;
  cs: BABYLON.ComputeShader[];
  t: number;

  constructor(numParticles: number, params: SimParams, scene: Scene) {
    const engine = scene.getEngine();

    this.numParticles = numParticles;

    // Create boid mesh
    const boidMesh = BABYLON.MeshBuilder.CreatePlane(
      "plane",
      { size: 1 },
      scene,
    );

    this.mesh = boidMesh;

    boidMesh.forcedInstanceCount = numParticles;

    //const mesh = new BABYLON.Mesh("boid", scene);
    //new BABYLON.Geometry(BABYLON.Geometry.RandomId(), scene, null, false, mesh);

    const mat = new BABYLON.ShaderMaterial(
      "mat",
      scene,
      {
        vertexSource: boidVertexShader,
        fragmentSource: boidFragmentShader,
      },
      {
        attributes: ["a_pos", "a_particlePos", "a_particleVel"],
      },
    );

    boidMesh.material = mat;

    const buffSpriteVertex = new BABYLON.VertexBuffer(
      engine,
      [-0.01, -0.02, 0.01, -0.02, 0.0, 0.02],
      "a_pos",
      false,
      false,
      2,
      false,
    );

    boidMesh.setIndices([0, 1, 2]);
    boidMesh.setVerticesBuffer(buffSpriteVertex);

    // Create uniform / storage / vertex buffers
    this.simParams = new BABYLON.UniformBuffer(
      engine,
      undefined,
      undefined,
      "simParams",
    );

    this.simParams.addUniform;

    this.simParams.addUniform("deltaT", 1);
    this.simParams.addUniform("rule1Distance", 1);
    this.simParams.addUniform("rule2Distance", 1);
    this.simParams.addUniform("rule3Distance", 1);
    this.simParams.addUniform("rule1Scale", 1);
    this.simParams.addUniform("rule2Scale", 1);
    this.simParams.addUniform("rule3Scale", 1);
    this.simParams.addUniform("numParticles", 1);
    this.simParams.create();

    this.updateSimParams(params);

    const initialParticleData = new Float32Array(numParticles * 4);
    for (let i = 0; i < numParticles; ++i) {
      initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
      initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
      initialParticleData[4 * i + 2] = 2 * (Math.random() - 0.5) * 0.1;
      initialParticleData[4 * i + 3] = 2 * (Math.random() - 0.5) * 0.1;
    }

    this.particleBuffers = [
      new BABYLON.StorageBuffer(
        engine,
        initialParticleData.byteLength,
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
          BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      ),
      new BABYLON.StorageBuffer(
        engine,
        initialParticleData.byteLength,
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
          BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      ),
    ];

    this.particleBuffers[0].update(initialParticleData);
    this.particleBuffers[1].update(initialParticleData);

    this.vertexBuffers = [
      [
        new BABYLON.VertexBuffer(
          engine,
          this.particleBuffers[0].getBuffer(),
          "a_particlePos",
          false,
          false,
          4,
          true,
          0,
          2,
        ),
        new BABYLON.VertexBuffer(
          engine,
          this.particleBuffers[0].getBuffer(),
          "a_particleVel",
          false,
          false,
          4,
          true,
          2,
          2,
        ),
      ],
      [
        new BABYLON.VertexBuffer(
          engine,
          this.particleBuffers[1].getBuffer(),
          "a_particlePos",
          false,
          false,
          4,
          true,
          0,
          2,
        ),
        new BABYLON.VertexBuffer(
          engine,
          this.particleBuffers[1].getBuffer(),
          "a_particleVel",
          false,
          false,
          4,
          true,
          2,
          2,
        ),
      ],
    ];

    // Create compute shaders
    this.cs1 = new BABYLON.ComputeShader(
      "compute1",
      engine,
      { computeSource: boidComputeShader },
      {
        bindingsMapping: {
          params: { group: 0, binding: 0 },
          particlesA: { group: 0, binding: 1 },
          particlesB: { group: 0, binding: 2 },
        },
      },
    );
    this.cs1.setUniformBuffer("params", this.simParams);
    this.cs1.setStorageBuffer("particlesA", this.particleBuffers[0]);
    this.cs1.setStorageBuffer("particlesB", this.particleBuffers[1]);

    this.cs2 = new BABYLON.ComputeShader(
      "compute2",
      engine,
      { computeSource: boidComputeShader },
      {
        bindingsMapping: {
          params: { group: 0, binding: 0 },
          particlesA: { group: 0, binding: 1 },
          particlesB: { group: 0, binding: 2 },
        },
      },
    );
    this.cs2.setUniformBuffer("params", this.simParams);
    this.cs2.setStorageBuffer("particlesA", this.particleBuffers[1]);
    this.cs2.setStorageBuffer("particlesB", this.particleBuffers[0]);

    this.cs = [this.cs1, this.cs2];
    this.t = 0;
  }

  dispose() {
    this.simParams.dispose();
    this.particleBuffers[0].dispose();
    this.particleBuffers[1].dispose();
    // this.cs1.dispose();
    // this.cs2.dispose();
  }

  updateSimParams(simParams: SimParams) {
    this.simParams.updateFloat("deltaT", simParams.deltaT);
    this.simParams.updateFloat("rule1Distance", simParams.rule1Distance);
    this.simParams.updateFloat("rule2Distance", simParams.rule2Distance);
    this.simParams.updateFloat("rule3Distance", simParams.rule3Distance);
    this.simParams.updateFloat("rule1Scale", simParams.rule1Scale);
    this.simParams.updateFloat("rule2Scale", simParams.rule2Scale);
    this.simParams.updateFloat("rule3Scale", simParams.rule3Scale);
    this.simParams.updateInt("numParticles", this.numParticles);
    this.simParams.update();
  }

  update() {
    this.cs[this.t].dispatch(Math.ceil(this.numParticles / 64));

    this.mesh.setVerticesBuffer(this.vertexBuffers[this.t][0], false);
    this.mesh.setVerticesBuffer(this.vertexBuffers[this.t][1], false);

    this.t = (this.t + 1) % 2;
  }
}

const boidVertexShader = `
    attribute vec2 a_pos;
    attribute vec2 a_particlePos;
    attribute vec2 a_particleVel;
    
    void main() {
        float angle = -atan(a_particleVel.x, a_particleVel.y);
        vec2 pos = vec2(
            a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle)
        );
        gl_Position = vec4(pos + a_particlePos, 0.0, 1.0);
    }
`;

const boidFragmentShader = `
    void main() {
        gl_FragColor = vec4(0.8, 0.2, 1.0, 1.0);
    }
`;

const boidComputeShader = `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
};
struct SimParams {
  deltaT : f32,
  rule1Distance : f32,
  rule2Distance : f32,
  rule3Distance : f32,
  rule1Scale : f32,
  rule2Scale : f32,
  rule3Scale : f32,
  numParticles: u32,
};
struct Particles {
  particles : array<Particle>,
};
@binding(0) @group(0) var<uniform> params : SimParams;
@binding(1) @group(0) var<storage, read> particlesA : Particles;
@binding(2) @group(0) var<storage, read_write> particlesB : Particles;

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var index : u32 = GlobalInvocationID.x;

  if (index >= params.numParticles) {
      return;
  }

  var vPos : vec2<f32> = particlesA.particles[index].pos;
  var vVel : vec2<f32> = particlesA.particles[index].vel;
  var cMass : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var colVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cMassCount : u32 = 0u;
  var cVelCount : u32 = 0u;
  var pos : vec2<f32>;
  var vel : vec2<f32>;

  for (var i : u32 = 0u; i < arrayLength(&particlesA.particles); i = i + 1u) {
    if (i == index) {
      continue;
    }

    pos = particlesA.particles[i].pos.xy;
    vel = particlesA.particles[i].vel.xy;
    if (distance(pos, vPos) < params.rule1Distance) {
      cMass = cMass + pos;
      cMassCount = cMassCount + 1u;
    }
    if (distance(pos, vPos) < params.rule2Distance) {
      colVel = colVel - (pos - vPos);
    }
    if (distance(pos, vPos) < params.rule3Distance) {
      cVel = cVel + vel;
      cVelCount = cVelCount + 1u;
    }
  }
  if (cMassCount > 0u) {
    var temp : f32 = f32(cMassCount);
    cMass = (cMass / vec2<f32>(temp, temp)) - vPos;
  }
  if (cVelCount > 0u) {
    var temp : f32 = f32(cVelCount);
    cVel = cVel / vec2<f32>(temp, temp);
  }
  vVel = vVel + (cMass * params.rule1Scale) + (colVel * params.rule2Scale) +
      (cVel * params.rule3Scale);

  // clamp velocity for a more pleasing simulation
  vVel = normalize(vVel) * clamp(length(vVel), 0.0, 0.1);
  // kinematic update
  vPos = vPos + (vVel * params.deltaT);
  // Wrap around boundary
  if (vPos.x < -1.0) {
    vPos.x = 1.0;
  }
  if (vPos.x > 1.0) {
    vPos.x = -1.0;
  }
  if (vPos.y < -1.0) {
    vPos.y = 1.0;
  }
  if (vPos.y > 1.0) {
    vPos.y = -1.0;
  }
  // Write back
  particlesB.particles[index].pos = vPos;
  particlesB.particles[index].vel = vVel;
}
`;
