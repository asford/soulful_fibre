// @refresh reset

import { Engine, Scene } from "@babylonjs/core";
import * as BABYLON from "@babylonjs/core";
import * as THREE from "three";
import SceneComponent from "./babylonjs-hook";
import { useRef } from "react";

import * as _ from "lodash";
import ndarray from "ndarray";
import { updateCamera } from "@react-three/fiber/dist/declarations/src/core/utils";
import { GUI } from "dat.gui";

import {
  UniformAdapter,
  StorageAdapter,
  BufferableStruct,
} from "./compute_util";

import { init_gui, add_folder } from "./gui_utils";

import {
  Vector2 as vec2,
  Vector3 as vec3,
  Vector4 as vec4,
  Color3 as col3,
  Color4 as col4,
} from "@babylonjs/core";

import * as d3 from "d3";

export function App() {
  const params = useRef<Params>({
    deltaT: 0.06,
    cohesion_dist: 0.15,
    separation_dist: 0.025,
    alignment_dist: 0.025,
    cohesion_scale: 0.02,
    separation_scale: 0.05,
    alignment_scale: 0.005,
  });

  const params_opts = {
    deltaT: [-0.25, 0.25, 0.005],
    cohesion_dist: [0, 0.5, 0.005],
    separation_dist: [0, 0.2, 0.005],
    alignment_dist: [0, 0.5, 0.005],
    cohesion_scale: [-0.1, 0.5, 0.01],
    separation_scale: [-0.1, 0.5, 0.01],
    alignment_scale: [-0.01, 0.05, 0.001],
  };

  const boids = useRef<Boid>(null!);
  const gui = useRef<GUI>(null!);

  const onSceneReady = (scene: Scene) => {
    const engine = scene.getEngine();
    scene.clearColor = BABYLON.Color3.Black().toColor4(1.0);

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

    gui.current = init_gui();
    add_folder(gui.current, "params", params.current, params_opts).open();

    boids.current = new Boid(1000, params.current, scene);

    function attach_bloom_pipeline(
      name: string,
      weight: number,
      kernel: number,
      threshold: number,
    ) {
      const bloom = new BABYLON.BloomEffect(scene, 1, 0, 0);
      bloom.weight = weight;
      bloom.kernel = kernel;
      bloom.threshold = threshold;

      var standardPipeline = new BABYLON.PostProcessRenderPipeline(
        engine,
        `${name}_pipeline`,
      );
      standardPipeline.addEffect(bloom);

      // Add pipeline to the scene's manager and attach to the camera
      scene.postProcessRenderPipelineManager.addPipeline(standardPipeline);
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        `${name}_pipeline`,
        camera,
      );

      add_folder(
        gui.current,
        name,
        bloom,
        {
          threshold: [0.0, 1.0, 0.001],
          weight: [0.0, 8, 0.1],
          kernel: [0.0, 256, 1],
        },
        true,
      );

      return bloom;
    }

    attach_bloom_pipeline("bloom0", 2.2, 12, 0.01);
    attach_bloom_pipeline("bloom1", 1, 160, 0.01);

    gui.current.add(boids.current, "init_particles");
  };

  const onRender = (scene: Scene) => {
    boids.current.step();
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

const null_particle: Particle = {
  pos: new vec2(),
  vel: new vec2(),
  color: new col4(),
};

class Boid {
  numParticles: number;
  params: Params;

  params_buffer: UniformAdapter<Params>;
  particle_buffer: StorageAdapter<Particle>;
  cs: BABYLON.ComputeShader;
  mesh: BABYLON.Mesh;

  constructor(numParticles: number, params: Params, scene: Scene) {
    const engine = scene.getEngine();

    this.numParticles = numParticles;

    // Create boid mesh
    this.mesh = BABYLON.MeshBuilder.CreatePlane("plane", { size: 1 }, scene);
    this.mesh.forcedInstanceCount = numParticles;

    const mat = new BABYLON.ShaderMaterial(
      "mat",
      scene,
      {
        vertexSource: boidVertexShader,
        fragmentSource: boidFragmentShader,
      },
      {
        attributes: [
          "a_pos",
          "a_particle_pos",
          "a_particle_vel",
          "a_particle_color",
        ],
      },
    );

    mat.alpha = 0.95;

    this.mesh.material = mat;

    const buffSpriteVertex = new BABYLON.VertexBuffer(
      engine,
      [-0.01, -0.02, 0.01, -0.02, 0.0, 0.02],
      "a_pos",
      false,
      false,
      2,
      false,
    );

    this.mesh.setIndices([0, 1, 2]);
    this.mesh.setVerticesBuffer(buffSpriteVertex);

    // Create uniform / storage / vertex buffers
    this.params = params;
    this.params_buffer = new UniformAdapter(this.params, engine, "params");

    this.particle_buffer = new StorageAdapter(
      null_particle,
      numParticles,
      engine,
      "a_particle_",
    );

    this.init_particles();

    _.each(this.particle_buffer.vertex_buffers, (vertex_buffer) => {
      this.mesh.setVerticesBuffer(vertex_buffer, false);
    });

    // Create compute shaders
    this.cs = new BABYLON.ComputeShader(
      "compute1",
      engine,
      { computeSource: boidComputeShader },
      {
        bindingsMapping: {
          params: { group: 0, binding: 0 },
          particles: { group: 0, binding: 1 },
        },
      },
    );
    this.cs.setUniformBuffer("params", this.params_buffer.buffer);
    this.cs.setStorageBuffer("particles", this.particle_buffer.storage_buffer);
  }

  dispose() {
    this.params_buffer.buffer.dispose();
    this.particle_buffer.storage_buffer.dispose();
  }

  init_particles() {
    const part = this.particle_buffer.get(0);
    const unit = d3.randomUniform(-1, 1);

    for (let i = 0; i < this.numParticles; ++i) {
      part.pos.x = unit();
      part.pos.y = unit();

      part.vel.x = unit() * 0.1;
      part.vel.y = unit() * 0.1;

      const color = new THREE.Color();
      color.setHSL((i / this.numParticles) * 360.0, 0.6, 0.5);
      part.color.r = color.r;
      part.color.g = color.g;
      part.color.b = color.b;
      part.color.a = 0.5;

      this.particle_buffer.set(i, part);
    }

    this.particle_buffer.update();
  }

  _step: number = 0;
  step() {
    this._step += 1;

    this.params_buffer.update(this.params);
    this.cs.dispatchWhenReady(Math.ceil(this.numParticles / 64));
  }
}

const boidVertexShader = `
    attribute vec2 a_pos;
    attribute vec2 a_particle_pos;
    attribute vec2 a_particle_vel;
    attribute vec4 a_particle_color;

    varying vec4 frag_color;
    
    void main() {
        float angle = -atan(a_particle_vel.x, a_particle_vel.y);
        vec2 pos = vec2(
            a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle)
        );
        gl_Position = vec4(pos + a_particle_pos, 0.0, 1.0);
        frag_color = a_particle_color;
    }
`;

const boidFragmentShader = `
    varying vec4 frag_color;

    void main() {
        gl_FragColor = frag_color;
    }
`;

interface Particle extends BufferableStruct {
  pos: vec2;
  vel: vec2;
  color: col4;
}

interface Params extends BufferableStruct {
  deltaT: number;
  cohesion_dist: number;
  separation_dist: number;
  alignment_dist: number;
  cohesion_scale: number;
  separation_scale: number;
  alignment_scale: number;
}

const boidComputeShader = `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  color : vec4<f32>,
};

struct Params {
  deltaT : f32,
  cohesion_dist : f32,
  separation_dist : f32,
  alignment_dist : f32,
  cohesion_scale : f32,
  separation_scale : f32,
  alignment_scale : f32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> particles : array<Particle>;

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var index : u32 = GlobalInvocationID.x;
  var num_particles : u32 = arrayLength(&particles);

  if (index >= num_particles) {
      return;
  }

  var vPos : vec2<f32> = particles[index].pos;
  var vVel : vec2<f32> = particles[index].vel;
  var cMass : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var colVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cMassCount : u32 = 0u;
  var cVelCount : u32 = 0u;
  var pos : vec2<f32>;
  var vel : vec2<f32>;

  for (var i : u32 = 0u; i < num_particles; i = i + 1u) {
    if (i == index) {
      continue;
    }

    pos = particles[i].pos.xy;
    vel = particles[i].vel.xy;
    if (distance(pos, vPos) < params.cohesion_dist) {
      cMass = cMass + pos;
      cMassCount = cMassCount + 1u;
    }
    if (distance(pos, vPos) < params.separation_dist) {
      colVel = colVel - (pos - vPos);
    }
    if (distance(pos, vPos) < params.alignment_dist) {
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
  vVel = vVel + (cMass * params.cohesion_scale) + (colVel * params.separation_scale) +
      (cVel * params.alignment_scale);

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
  particles[index].pos = vPos;
  particles[index].vel = vVel;
}
`;
