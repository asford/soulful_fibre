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
import drawboid_compute from "./drawboid_compute.wgsl";

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
  attract_force: number;
  curl_force: number;
  size_factor: number;
  color_factor: number;
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
  attract_force: 0.1,
  curl_force: 0.1,
  curl_scale: 1,
  size_factor: 0.3,
  color_factor: 0.6,
};

const params_ranges = {
  delta_t: [-0.05, 0.15],
  attract_scale: [-0.5, 100, 0.1],
  size_factor: [0.0, 2, 0.001],
  curl_scale: [-2, 2, 0.001],
  color_factor: [0.0, 2, 0.001],
};

const default_opts = {
  init_size: 0.5,
  size_median: 1.0,
  size_range: 0.05,
  track: true,
};

class RingIndex {
  public current: number = 0;
  constructor(public size: number) {}

  next() {
    this.current = (this.current + 1) % this.size;
    return this.current;
  }
}

export function App() {
  const opts = useRef(_.cloneDeep(default_opts));
  const boids = useRef<BoidScene<Params, Particle, ParticleParams>>(null!);
  const head = useRef<RingIndex>(null!);
  const gui = useRef<GUI>(null!);
  const num_particles = 10000;

  const pointer_ndc = useRef({
    x: 0,
    y: 0,
  });

  const init_particles = (): void => {
    const part = boids.current.particle_buffer.get(0);
    const unit = d3.randomUniform(-1, 1);

    const params = boids.current.particle_param_buffer.get(0);

    const scale = d3.randomUniform(
      opts.current.size_median - opts.current.size_range,
      opts.current.size_median + opts.current.size_range,
    );

    for (var i = 0; i < num_particles; i++) {
      part.pos.x = unit() * opts.current.init_size;
      part.pos.y = unit() * opts.current.init_size;

      part.pos.x = (i / num_particles - 0.5) * 1.6;

      part.vel.x = 0.0;
      part.vel.y = 0.0;

      boids.current.particle_buffer.set(i, part);

      var color = new THREE.Color();
      color = color.setHSL(
        ((i / boids.current.num_particles) * 300) / 360,
        0.6,
        0.5,
      );
      params.color.r = color.r;
      params.color.g = color.g;
      params.color.b = color.b;
      params.color.a = 1.0;

      params.size = scale();
      boids.current.particle_param_buffer.set(i, params);
    }

    boids.current.particle_buffer.update();
    boids.current.particle_param_buffer.update();
  };

  const init_particle = (attractor: vec2): void => {
    const i = head.current.next();
    const params = boids.current.particle_param_buffer.get(i);
    params.attractor.copyFrom(attractor);
    boids.current.particle_param_buffer.set(i, params);
  };

  const onSceneReady = (scene: Scene) => {
    boids.current = new BoidScene(
      scene,
      num_particles,
      drawboid_compute,
      default_params,
      null_particle,
      null_particle_params,
    );
    head.current = new RingIndex(boids.current.num_particles);

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

    init_particles();
    gui.current.add({ init_particles: init_particles }, "init_particles");
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
      for (let index = 0; index < boids.current.num_particles / 10; index++) {
        init_particle(ndc);
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
