// @refresh reset

import { Scene } from "@babylonjs/core";
import { useRef } from "react";
import SceneComponent from "../babylon_compute/babylonjs-hook";

import { GUI } from "dat.gui";
import * as _ from "lodash";
import * as THREE from "three";

import { BufferableStruct } from "../babylon_compute/compute_util";

import { add_folder, init_gui } from "../babylon_compute/gui_utils";

import { Color4 as col4, Vector2 as vec2 } from "@babylonjs/core";

import * as d3 from "d3";

import { BoidScene } from "./boid_scene";
import glowboid_compute from "./glowboid_compute.wgsl";

interface Particle extends BufferableStruct {
  pos: vec2;
  vel: vec2;
  color: col4;
  size: number;
  pad1: number;
  pad2: number;
  pad3: number;
}

interface ParticleParams extends BufferableStruct {
  color: col4;
  attractor: vec2;
  size: number;
  pad1: number;
}

interface Params extends BufferableStruct {
  delta_t: number;
  cohesion_dist: number;
  separation_dist: number;
  alignment_dist: number;
  cohesion_scale: number;
  separation_scale: number;
  alignment_scale: number;
  attract_dist: number;
  attract_scale: number;
  size_factor: number;
}

const null_particle: Particle = {
  pos: new vec2(),
  vel: new vec2(),
  color: new col4(),
  size: 1.0,
  pad1: 0.0,
  pad2: 0.0,
  pad3: 0.0,
};

const null_particle_params: ParticleParams = {
  color: new col4(),
  attractor: new vec2(),
  size: 1.0,
  pad1: 0.0,
};

const default_params = {
  delta_t: 0.05,
  cohesion_dist: 0.15,
  separation_dist: 0.025,
  alignment_dist: 0.025,
  cohesion_scale: 0.4,
  separation_scale: 1,
  alignment_scale: 0.1,
  attract_dist: 0.0,
  attract_scale: 0.1,
  size_factor: 0.2,
  color_factor: 1.0,
};

const params_ranges = {
  delta_t: [-0.05, 0.15],
  cohesion_dist: [0, 0.5, 0.005],
  separation_dist: [0, 0.1, 0.005],
  alignment_dist: [0, 0.5, 0.005],
  attract_dist: [0, 0.5, 0.005],

  cohesion_scale: [-1, 1.5, 0.05],
  separation_scale: [-1, 1.5, 0.05],
  alignment_scale: [-0.1, 0.5, 0.01],
  attract_scale: [-0.5, 0.5, 0.001],
  size_factor: [0.0, 2, 0.001],
  color_factor: [0.0, 2, 0.001],
};

const default_opts = {
  init_size: 0.01,
  size_median: 0.2,
  size_range: 0.05,
  track: false,
};

export function App() {
  const opts = useRef(_.cloneDeep(default_opts));
  const boids = useRef<BoidScene<Params, Particle, ParticleParams>>(null!);
  const gui = useRef<GUI>(null!);

  const pointer_ndc = useRef({
    x: 0,
    y: 0,
  });

  const init_particles = () => {
    const part = boids.current.particle_buffer.get(0);
    const params = boids.current.particle_param_buffer.get(0);

    const unit = d3.randomUniform(-1, 1);
    const scale = d3.randomUniform(
      opts.current.size_median - opts.current.size_range,
      opts.current.size_median + opts.current.size_range,
    );

    for (let i = 0; i < boids.current.num_particles; ++i) {
      // Compress into small space for "explosive start"
      part.pos.x = unit() * opts.current.init_size;
      part.pos.y = unit() * opts.current.init_size;

      part.vel.x = unit() * 0.1;
      part.vel.y = unit() * 0.1;
      boids.current.particle_buffer.set(i, part);

      const color = new THREE.Color();
      color.setHSL((i / boids.current.num_particles) * 360.0, 0.6, 0.5);
      params.color.r = color.r;
      params.color.g = color.g;
      params.color.b = color.b;
      params.color.a = 1.0;
      params.scale = scale();
      boids.current.particle_param_buffer.set(i, params);
    }

    boids.current.particle_buffer.update();
    boids.current.particle_param_buffer.update();
  };

  const onSceneReady = (scene: Scene) => {
    boids.current = new BoidScene(
      scene,
      4000,
      glowboid_compute,
      default_params,
      null_particle,
      null_particle_params,
    );

    gui.current = init_gui();
    add_folder(
      gui.current,
      "params",
      boids.current.params,
      params_ranges,
    ).open();
    add_folder(gui.current, "opts", opts.current).open();
    add_folder(gui.current, "pointer_ndc", pointer_ndc.current, {
      x: [-1, 1, 0.001],
      y: [-1, 1, 0.001],
    });

    const glow_folder = gui.current.addFolder("glow");
    _.each(boids.current.glows, (glow) => {
      add_folder(
        glow_folder,
        glow.name,
        glow,
        {
          intensity: [0.0, 3, 0.1],
          blurKernelSize: [0.0, 256, 1],
        },
        true,
      ).open();
    });

    gui.current.add({ init_particles: init_particles }, "init_particles");

    init_particles();
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
      .multiply(new vec2(2.0, -2.0));

    _.merge(pointer_ndc.current, ndc);

    if (opts.current.track) {
      const p = boids.current.particle_param_buffer.get(0);
      for (let index = 0; index < boids.current.num_particles; index++) {
        boids.current.particle_param_buffer.get(index, p);
        p.attractor.x = ndc.x;
        p.attractor.y = ndc.y;
        boids.current.particle_param_buffer.set(index, p);
      }
      boids.current.particle_param_buffer.update();
    }

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
