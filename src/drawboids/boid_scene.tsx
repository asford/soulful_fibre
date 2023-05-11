import * as BABYLON from "@babylonjs/core";
import {
  BufferableStruct,
  UniformAdapter,
  StorageAdapter,
  create_compute_shader,
} from "../babylon_compute/compute_util";

import * as _ from "lodash";

interface GlowOpts {
  intensity: number;
  blurKernelSize: number;
}

export class BoidScene<
  ParamT extends BufferableStruct,
  ParticleT extends BufferableStruct,
  ParticleParamT extends BufferableStruct,
> {
  params_buffer: UniformAdapter<ParamT>;
  particle_buffer: StorageAdapter<ParticleT>;
  particle_param_buffer: StorageAdapter<ParticleParamT>;
  cs: BABYLON.ComputeShader;
  mesh: BABYLON.Mesh;
  glows: BABYLON.GlowLayer[];

  constructor(
    scene: BABYLON.Scene,
    public num_particles: number,
    public compute_shader: string,
    public params: ParamT,
    public empty_particle: ParticleT,
    public empty_particle_params: ParticleParamT,
    public glow_opts: GlowOpts[] = [
      { intensity: 2, blurKernelSize: 8 },
      { intensity: 1, blurKernelSize: 32 },
      { intensity: 2, blurKernelSize: 64 },
      { intensity: 2, blurKernelSize: 128 },
    ],
  ) {
    const engine = scene.getEngine();

    if (!engine.getCaps().supportComputeShaders) {
      console.error("Compute shaders not supported.", engine, engine.getCaps());
      throw Error("Scene does not support compute shaders.");
    }

    // Initialize scene and camera. Boids render in arbitrary NDC space, ignoring camera.
    var camera = new BABYLON.ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 2,
      10,
      BABYLON.Vector3.Zero(),
      scene,
    );
    camera.setTarget(BABYLON.Vector3.Zero());

    scene.clearColor = BABYLON.Color3.Black().toColor4(1.0);

    // Create uniform / storage / vertex buffers
    this.params = params;

    this.params_buffer = new UniformAdapter(this.params, engine, "params");
    this.particle_buffer = new StorageAdapter(
      empty_particle,
      num_particles,
      engine,
      "a_particle_",
    );
    this.particle_param_buffer = new StorageAdapter(
      empty_particle_params,
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
        attributes: _.concat(
          ["a_pos"],
          _.map(this.particle_buffer.vertex_buffers, (vb) => vb.getKind()),
          _.map(this.particle_param_buffer.vertex_buffers, (vb) =>
            vb.getKind(),
          ),
        ),
      },
    );
    mat.alpha = 0.9;

    this.mesh.material = mat;

    this.cs = create_compute_shader(engine, "boid_compute", compute_shader);

    // Not using bloom pipeline, which relies on intensity masking.
    // This means stacked bloom layers over-add each other.
    // Instead configure glow layer directly from the source mesh color.
    // Semi-simulate the unreal bloom effect via stacked glows
    this.glows = _.map(this.glow_opts, (params, idx) => {
      var gl = new BABYLON.GlowLayer(`glow_${idx}`, scene);

      _.merge(gl, params);
      // set up material to use glow layer
      gl.addIncludedOnlyMesh(this.mesh);
      gl.referenceMeshToUseItsOwnMaterial(this.mesh);
      return gl;
    });

    this.allocate_buffers();
  }

  allocate_buffers() {
    // Bind both the particle state and particle parameters as vertex buffer attributes.
    // They are then available by name as attributes in the vertex shader.
    _.each(this.particle_buffer.vertex_buffers, (vertex_buffer) => {
      this.mesh.setVerticesBuffer(vertex_buffer, false);
    });

    _.each(this.particle_param_buffer.vertex_buffers, (vertex_buffer) => {
      this.mesh.setVerticesBuffer(vertex_buffer, false);
    });

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
    this.particle_param_buffer.storage_buffer.dispose();
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
    attribute float a_particle_size;

    varying vec4 frag_color;
    
    void main() {
        float angle = -atan(a_particle_vel.x, a_particle_vel.y);
        vec2 pos = vec2(
            a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle)
        ) * a_particle_size;
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
