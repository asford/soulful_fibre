// @refresh reset

import { Engine, Scene } from "@babylonjs/core";
import * as BABYLON from "@babylonjs/core";
import * as THREE from "three";
import SceneComponent from "../babylon_compute/babylonjs-hook";
import { useRef } from "react";

import * as _ from "lodash";
import { GUI } from "dat.gui";

import {
  UniformAdapter,
  StorageAdapter,
  BufferableStruct,
  create_compute_shader,
} from "../babylon_compute/compute_util";

import { init_gui, add_folder } from "../babylon_compute/gui_utils";

import {
  Vector2 as vec2,
  Vector3 as vec3,
  Vector4 as vec4,
  Color3 as col3,
  Color4 as col4,
} from "@babylonjs/core";

import * as d3 from "d3";

import glowboid_compute from "./glowboid_compute.wgsl";

export function App() {
  const defaults: {
    params: Params;
    boid_opts: BoidOpts;
    glows: { intensity: number; blurKernelSize: number }[];
  } = {
    params: {
      deltaT: 0.06,
      cohesion_dist: 0.15,
      separation_dist: 0.025,
      alignment_dist: 0.025,
      cohesion_scale: 0.02,
      separation_scale: 0.05,
      alignment_scale: 0.005,
      attract_dist: 0.0,
      attract_scale: 0.005,
    },
    boid_opts: { init_scale: 0.01, size_median: 0.2, size_range: 0.05 },
    glows: [
      { intensity: 2, blurKernelSize: 8 },
      { intensity: 1, blurKernelSize: 32 },
      { intensity: 2, blurKernelSize: 64 },
      { intensity: 2, blurKernelSize: 128 },
    ],
  };

  const params_opts = {
    deltaT: [-0.25, 0.25, 0.005],
    cohesion_dist: [0, 0.5, 0.005],
    separation_dist: [0, 0.2, 0.005],
    alignment_dist: [0, 0.5, 0.005],
    cohesion_scale: [-0.1, 0.5, 0.01],
    separation_scale: [-0.1, 0.5, 0.01],
    alignment_scale: [-0.01, 0.05, 0.001],

    attract_dist: [0, 0.5, 0.005],
    attract_scale: [-0.01, 0.05, 0.001],
  };

  const opts = useRef(_.cloneDeep(defaults));
  const boids = useRef<Boid>(null!);
  const gui = useRef<GUI>(null!);
  const pointer_ndc = useRef({
    x: 0,
    y: 0,
  });

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
    add_folder(gui.current, "params", opts.current.params, params_opts).open();
    add_folder(gui.current, "boid_opts", opts.current.boid_opts, params_opts);
    add_folder(gui.current, "pointer_ndc", pointer_ndc.current, {
      x: [-1, 1, 0.001],
      y: [-1, 1, 0.001],
    });

    boids.current = new Boid(
      scene,
      4000,
      opts.current.params,
      opts.current.boid_opts,
    );

    const glow_folder = gui.current.addFolder("glow");
    function attach_glow_pipeline(
      name: string,
      params: {
        intensity: number;
        blurKernelSize: number;
      },
    ) {
      var gl = new BABYLON.GlowLayer("glow", scene);

      _.merge(gl, params);
      gl.addIncludedOnlyMesh(boids.current.mesh);
      // set up material to use glow layer
      gl.referenceMeshToUseItsOwnMaterial(boids.current.mesh);

      add_folder(
        glow_folder,
        name,
        gl,
        {
          intensity: [0.0, 3, 0.1],
          blurKernelSize: [0.0, 256, 1],
        },
        true,
      ).open();
    }

    // Not using bloom pipeline, which relies on intensity masking.
    // This means stacked bloom layers over-add each other.
    // Instead configure glow layer directly from the source mesh color.
    // attach_bloom_pipeline("bloom0", 2.2, 12, 0.01);
    // attach_bloom_pipeline("bloom1", 1, 160, 0.01);

    // Semi-simulate the unreal bloom effect via stacked glows
    _.each(opts.current.glows, (params, idx) => {
      attach_glow_pipeline(`glow_${idx}`, params);
    });

    gui.current.add(boids.current, "init_particles");
  };

  const onRender = (scene: Scene) => {
    const pcoord = new vec2(scene.pointerX, scene.pointerY);
    const screen = new vec2(
      scene.getEngine().getRenderWidth(),
      scene.getEngine().getRenderHeight(),
    );
    const ndc = pcoord
      .divide(screen)
      .subtract(new vec2(0.5, 0.5))
      .multiply(new vec2(2.0, 2.0));

    _.merge(pointer_ndc.current, ndc);

    scene.getEngine().getRenderHeight();

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

interface BoidOpts {
  init_scale: number;
  size_median: number;
  size_range: number;
}

class Boid {
  params_buffer: UniformAdapter<Params>;
  particle_buffer: StorageAdapter<Particle>;
  particle_param_buffer: StorageAdapter<ParticleParam>;
  cs: BABYLON.ComputeShader;
  mesh: BABYLON.Mesh;

  constructor(
    scene: Scene,
    public num_particles: number,
    public params: Params,
    public opts: BoidOpts,
  ) {
    const engine = scene.getEngine();

    this.num_particles = num_particles;

    // Create uniform / storage / vertex buffers
    this.params = params;
    this.params_buffer = new UniformAdapter(this.params, engine, "params");

    this.particle_buffer = new StorageAdapter(
      null_particle,
      num_particles,
      engine,
      "a_particle_",
    );
    this.particle_param_buffer = new StorageAdapter(
      null_particle_param,
      num_particles,
      engine,
      "a_particle_param_",
    );

    // Create boid mesh.
    this.mesh = BABYLON.MeshBuilder.CreatePlane("plane", { size: 1 }, scene);
    this.mesh.forcedInstanceCount = num_particles;

    this.mesh.setIndices([0, 1, 2]);
    this.mesh.setVerticesBuffer(
      new BABYLON.VertexBuffer(
        engine,
        _.flatten([
          [0.0, 0.02],
          [-0.01, -0.02],
          [0.01, -0.02],
        ]),
        "a_pos",
        false,
        false,
        2,
        false,
      ),
    );

    // Material
    // https://www.youtube.com/watch?v=5ZuM-WLqEPQ
    const mat = new BABYLON.ShaderMaterial(
      "mat",
      scene,
      {
        vertexSource: boid_vertex_shader,
        fragmentSource: boid_fragment_shader,
      },
      {
        attributes: [
          "a_pos",
          "a_particle_pos",
          "a_particle_vel",
          "a_particle_color",
          "a_particle_scale",
        ],
      },
    );
    mat.alpha = 0.9;

    this.mesh.material = mat;
    _.each(this.particle_buffer.vertex_buffers, (vertex_buffer) => {
      this.mesh.setVerticesBuffer(vertex_buffer, false);
    });

    this.init_particles();

    this.cs = create_compute_shader(
      engine,
      "glowboid_compute",
      glowboid_compute,
    );

    this.cs.setUniformBuffer("params", this.params_buffer.buffer);
    this.cs.setStorageBuffer("particles", this.particle_buffer.storage_buffer);
    this.cs.setStorageBuffer(
      "particle_params",
      this.particle_param_buffer.storage_buffer,
    );
  }

  dispose() {
    this.params_buffer.buffer.dispose();
    this.particle_buffer.storage_buffer.dispose();
  }

  init_particles() {
    const part = this.particle_buffer.get(0);
    const unit = d3.randomUniform(-1, 1);
    const scale = d3.randomUniform(
      this.opts.size_median - this.opts.size_range,
      this.opts.size_median + this.opts.size_range,
    );

    for (let i = 0; i < this.num_particles; ++i) {
      // Compress into small space for "explosive start"
      part.pos.x = unit() * this.opts.init_scale;
      part.pos.y = unit() * this.opts.init_scale;

      part.vel.x = unit() * 0.1;
      part.vel.y = unit() * 0.1;

      const color = new THREE.Color();
      color.setHSL((i / this.num_particles) * 360.0, 0.6, 0.5);
      part.color.r = color.r;
      part.color.g = color.g;
      part.color.b = color.b;
      part.color.a = 1.0;

      part.scale = scale();

      this.particle_buffer.set(i, part);
    }

    this.particle_buffer.update();
  }

  _step: number = 0;
  step() {
    this._step += 1;

    this.params_buffer.update(this.params);
    this.cs.dispatchWhenReady(Math.ceil(this.num_particles / 64));
  }
}

const boid_vertex_shader = `
    attribute vec2 a_pos;
    attribute vec2 a_particle_pos;
    attribute vec2 a_particle_vel;
    attribute vec4 a_particle_color;
    attribute float a_particle_scale;

    varying vec4 frag_color;
    
    void main() {
        float angle = -atan(a_particle_vel.x, a_particle_vel.y);
        vec2 pos = vec2(
            a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle)
        ) * a_particle_scale;
        gl_Position = vec4(pos + a_particle_pos, 0.0, 1.0);
        frag_color = a_particle_color;
    }
`;

const boid_fragment_shader = `
    varying vec4 frag_color;

    void main() {
        gl_FragColor = frag_color;
    }
`;

interface Particle extends BufferableStruct {
  pos: vec2;
  vel: vec2;
  color: col4;
  scale: number;
  pad1: number;
  pad2: number;
  pad3: number;
}

const null_particle: Particle = {
  pos: new vec2(),
  vel: new vec2(),
  color: new col4(),
  scale: 1.0,
  pad1: 0.0,
  pad2: 0.0,
  pad3: 0.0,
};

interface ParticleParam extends BufferableStruct {
  attractor: vec2;
}

const null_particle_param: ParticleParam = {
  attractor: new vec2(),
};

interface Params extends BufferableStruct {
  deltaT: number;
  cohesion_dist: number;
  separation_dist: number;
  alignment_dist: number;
  cohesion_scale: number;
  separation_scale: number;
  alignment_scale: number;

  attract_dist: number;
  attract_scale: number;
}
