// @refresh reset

import { Engine, Scene } from "@babylonjs/core";
import * as BABYLON from "@babylonjs/core";
import * as THREE from "three";
import SceneComponent from "./babylonjs-hook";
import { useRef } from "react";

import * as _ from "underscore";
import ndarray from "ndarray";
import { updateCamera } from "@react-three/fiber/dist/declarations/src/core/utils";
import { GUI } from "dat.gui";

export function App() {
  const boids = useRef<Boid>(null!);
  const gui = useRef<GUI>(null!);

  const onSceneReady = (scene: Scene) => {
    const engine = scene.getEngine();

    const params: SimParams = {
      deltaT: 0.04,
      rule1Distance: 0.1,
      rule2Distance: 0.025,
      rule3Distance: 0.025,
      rule1Scale: 0.02,
      rule2Scale: 0.05,
      rule3Scale: 0.005,
    };

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

    boids.current = new Boid(1000, params, scene);

    // Clear gui wrapper on refresh
    _.each(document.getElementsByClassName("dg main"), (elem) => {
      elem.remove();
    });

    gui.current = new GUI();
    const params_folder = gui.current.addFolder("Params");
    _.each(params, (val, name) => {
      params_folder.add(params, name).listen();
    });
    gui.current.add(boids.current, "init_particles");

    // Create a bloom overlay
    var standardPipeline = new BABYLON.PostProcessRenderPipeline(
      engine,
      "standardPipeline",
    );

    var bloom = new BABYLON.BloomEffect(scene, 1, 5, 15);
    bloom.threshold = 0.04;
    standardPipeline.addEffect(bloom);

    // Add pipeline to the scene's manager and attach to the camera
    scene.postProcessRenderPipelineManager.addPipeline(standardPipeline);
    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
      "standardPipeline",
      camera,
    );
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

interface SimParams {
  deltaT: number;
  rule1Distance: number;
  rule2Distance: number;
  rule3Distance: number;
  rule1Scale: number;
  rule2Scale: number;
  rule3Scale: number;
}

interface Field {
  size: number;
  offset: number;
}

class UniformBuffer {
  fields: { [name: string]: Field };
  buffer: BABYLON.UniformBuffer;

  allocate(engine: Engine, name: string) {
    this.buffer = new BABYLON.UniformBuffer(engine, undefined, undefined, name);

    _.each(this.fields, (field, name) => {
      this.buffer.addUniform(name, field.size);
    });

    this.buffer.create();

    return this;
  }

  update(vals: { [name: string]: number }) {
    _.each(vals, (val, name) => {
      const field = this.fields[name];
      if (!field) {
        return;
      }

      if (field.size != 1) {
        throw Error("Can only update float uniforms.");
      }

      this.buffer.updateFloat(name, val);
    });

    this.buffer.update();
  }
}

class ArrayDataBuffer {
  fields: { [name: string]: Field };
  record_size: number;

  source_buffer: Float32Array;
  storage_buffer: BABYLON.StorageBuffer;
  vertex_buffers: BABYLON.VertexBuffer[];

  allocate(engine: Engine, size: number, vertex_name_prefix: string) {
    this.source_buffer = new Float32Array(size * this.record_size);
    this.storage_buffer = new BABYLON.StorageBuffer(
      engine,
      this.source_buffer.byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
    );

    const vertex_view = (kind: string, field: Field) => {
      const data = this.storage_buffer.getBuffer();
      return new BABYLON.VertexBuffer(
        engine,
        data,
        kind,
        false,
        false,
        this.record_size,
        true,
        field.offset,
        field.size,
      );
    };

    this.vertex_buffers = _.map(this.fields, (field, name) => {
      return vertex_view(vertex_name_prefix + name, field);
    });

    return this;
  }

  field_views() {
    const size = this.source_buffer.length / this.record_size;
    return _.mapObject(this.fields, (field) => {
      return ndarray(
        this.source_buffer,
        [size, field.size],
        [this.record_size, 1],
        field.offset,
      );
    });
  }

  update() {
    this.storage_buffer.update(this.source_buffer);
  }
}

class Boid {
  numParticles: number;
  params: SimParams;

  params_buffer: SimParamData;
  particle_buffer: ParticleData;
  cs: BABYLON.ComputeShader;
  mesh: BABYLON.Mesh;

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
        attributes: [
          "a_pos",
          "a_particle_pos",
          "a_particle_vel",
          "a_particle_color",
        ],
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
    this.params = params;
    this.params_buffer = new SimParamData().allocate(engine, "simParams");

    this.particle_buffer = new ParticleData().allocate(
      engine,
      numParticles,
      "a_particle_",
    );
    this.init_particles();

    _.each(this.particle_buffer.vertex_buffers, (vertex_buffer) => {
      boidMesh.setVerticesBuffer(vertex_buffer, false);
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
    const state = this.particle_buffer.field_views();

    for (let i = 0; i < this.numParticles; ++i) {
      state.pos.set(i, 0, 2 * (Math.random() - 0.5));
      state.pos.set(i, 1, 2 * (Math.random() - 0.5));

      state.vel.set(i, 0, 2 * (Math.random() - 0.5) * 0.1);
      state.vel.set(i, 1, 2 * (Math.random() - 0.5) * 0.1);

      const color = new THREE.Color();
      color.setHSL((i / this.numParticles) * 360.0, 0.6, 0.5);
      state.color.set(i, 0, color.r);
      state.color.set(i, 1, color.g);
      state.color.set(i, 2, color.b);
      state.color.set(i, 3, 1.0);
    }

    this.particle_buffer.update();
  }

  step() {
    this.params_buffer.update(this.params);
    this.cs.dispatch(Math.ceil(this.numParticles / 64));
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

class ParticleData extends ArrayDataBuffer {
  fields = {
    pos: { size: 2, offset: 0 },
    vel: { size: 2, offset: 2 },
    color: { size: 4, offset: 4 },
  };

  record_size = 8;
}

class SimParamData extends UniformBuffer {
  fields = {
    deltaT: { size: 1, offset: 0 },
    rule1Distance: { size: 1, offset: 1 },
    rule2Distance: { size: 1, offset: 2 },
    rule3Distance: { size: 1, offset: 3 },
    rule1Scale: { size: 1, offset: 4 },
    rule2Scale: { size: 1, offset: 5 },
    rule3Scale: { size: 1, offset: 6 },
  };
}

const boidComputeShader = `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  color : vec4<f32>,
};

struct SimParams {
  deltaT : f32,
  rule1Distance : f32,
  rule2Distance : f32,
  rule3Distance : f32,
  rule1Scale : f32,
  rule2Scale : f32,
  rule3Scale : f32,
};

@binding(0) @group(0) var<uniform> params : SimParams;
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
  particles[index].pos = vPos;
  particles[index].vel = vVel;
}
`;
