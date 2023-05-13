import {
  HAND_CONNECTIONS,
  NormalizedLandmark,
  NormalizedLandmarkListList,
  POSE_CONNECTIONS,
  POSE_LANDMARKS,
  POSE_LANDMARKS_LEFT,
  POSE_LANDMARKS_RIGHT,
  POSE_LANDMARKS_NEUTRAL,
  FACEMESH_TESSELATION,
} from "@mediapipe/holistic";
import * as d3 from "d3";
import p5, { Vector } from "p5";
import _ from "underscore";
import {
  default_video_constraints,
  HolisticCapture,
  CapResult,
} from "../holistic_capture";
import { VecScale, v, VecIsh } from "./vector";
import {
  chakra_colors,
  ChakraCoords,
  PoseCoords,
  chakra_meta,
  NUM_CHAK,
} from "../chakra_common";

const sin = Math.sin;
const cos = Math.cos;
const asin = Math.asin;
const acos = Math.acos;

var FPS: number = 30;
var hcap: HolisticCapture;
var p: p5;

// https://github.com/d3/d3-scale-chromatic#schemeSet2
const colors = {
  body: d3.schemeSet2[0],
  right: d3.schemeSet2[1],
  left: d3.schemeSet2[2],
  grey: d3.schemeSet2[7],
};

var screen_size: Vector;
var center: Vector;
var canvas_scale: number;
var canvas_cover: number = 0.8;

var render_aspect: number = 1;
var unit_domain: Vector[];
var render_range: Vector[];
var draw_frame: VecScale;

var cap_aspect: number;
var cap_domain: Vector[];
var cap_render_range: Vector[];
var cap_frame: VecScale;

var draw_buffer: p5;

function setup() {
  p.createCanvas(0, 0);
  p.frameRate(FPS);
  windowResized();

  const capture = p.createCapture(default_video_constraints());
  capture.hide();
  hcap = new HolisticCapture(capture.elt);
}

function windowResized() {
  p.resizeCanvas(p.windowWidth, p.windowHeight);

  screen_size = v(p.width, p.height);
  center = screen_size.copy().div(2);

  // normalize landmark into a selfy-ish, equally scaled x-y coordinate
  unit_domain = [v(-1, -1), v(1, 1)];

  var canvas_scale = Math.min(screen_size.x / 1, screen_size.y / render_aspect);

  render_range = [
    center
      .copy()
      .add(v(1, render_aspect).mult(-((canvas_scale * canvas_cover) / 2))),
    center
      .copy()
      .add(v(1, render_aspect).mult((canvas_scale * canvas_cover) / 2)),
  ];

  draw_frame = VecScale.linear().domain(unit_domain).range(render_range);
  draw_buffer = p.createGraphics(screen_size.x, screen_size.y);
  draw_buffer.clear(0, 0, 0, 0);

  if (!hcap) {
    return;
  }

  const cap = hcap.current;

  if (!cap.height || !cap.width) {
    return;
  }

  var cap_size = v(cap.width, cap.height);
  cap_aspect = cap_size.y / cap_size.x;

  var cap_canvas_scale = Math.min(
    screen_size.x / 1,
    screen_size.y / cap_aspect,
  );

  // normalize landmark into a selfy-ish, equally scaled x-y coordinate
  cap_domain = [v(1, 0), v(0, 1)];
  cap_render_range = [
    center
      .copy()
      .add(v(1, cap_aspect).mult(-((cap_canvas_scale * canvas_cover) / 2))),
    center
      .copy()
      .add(v(1, cap_aspect).mult((cap_canvas_scale * canvas_cover) / 2)),
  ];

  cap_frame = VecScale.linear().domain(cap_domain).range(cap_render_range);
}
function draw_cap_frame(p: p5, draw_frame: VecScale) {
  const l_to_f = draw_frame.bind();

  const lower = l_to_f(v(0, 0));
  const upper = l_to_f(v(1, 1));

  p.noFill()
    .stroke(colors.grey)
    .strokeWeight(1)
    .rectMode(p.CORNERS)
    .rect(lower.x, lower.y, upper.x, upper.y);
}

function draw_unit_frame(p: p5, draw_frame: VecScale) {
  const l_to_f = draw_frame.bind();

  const lower = l_to_f(v(-1, -1));
  const upper = l_to_f(v(1, 1));

  p.noFill()
    .stroke(colors.grey)
    .strokeWeight(1)
    .rectMode(p.CORNERS)
    .rect(lower.x, lower.y, upper.x, upper.y);
}

/// FROM https://openprocessing.org/sketch/1886905

function edge_points() {
  //a random chord on the edge of the unit circle
  var theta1 = p.random(p.TAU);
  var theta2 = theta1 + p.randomGaussian(0, p.PI / 8);
  var v1 = v(cos(theta1), sin(theta1));
  var v2 = v(cos(theta2), sin(theta2));

  return [v1, v2];
}

function cross_points(seg: number, tot_seg: number) {
  const seg_len = 2 / tot_seg;

  const seg_start = -1 + seg * seg_len;
  const seg_center = seg_start + seg_len / 2;
  const seg_end = seg_start + seg_len;

  const theta_start = acos(seg_start);
  const theta_center = acos(seg_center);
  const theta_end = acos(seg_end);

  const theta_dev =
    Math.max(
      Math.abs(theta_center - theta_start),
      Math.abs(theta_end - theta_start),
    ) / 3;

  var theta1 = p.randomGaussian(theta_center, theta_dev);
  var theta2 = p.randomGaussian(-theta_center, theta_dev);
  var v1 = v(sin(theta1), cos(theta1));
  var v2 = v(sin(theta2), cos(theta2));

  return [v1, v2];
}

function complexify_path(path_points: Vector[], stddev: number): Vector[] {
  //create a new path array from the old one by adding new points inbetween the old points
  var new_path: Vector[] = [];

  for (var i = 0; i < path_points.length - 1; i++) {
    var v1 = path_points[i];
    var v2 = path_points[i + 1];

    // @ts-expect-error
    var midPoint = p5.Vector.add(v1, v2).mult(0.5);
    var distance = v1.dist(v2);

    //the new point is halfway between the old points, with some gaussian variation
    var standardDeviation = stddev * distance;
    var vn = v(
      p.randomGaussian(midPoint.x, standardDeviation),
      p.randomGaussian(midPoint.y, standardDeviation),
    );
    new_path.push(v1);
    new_path.push(vn);
  }

  // @ts-expect-error
  new_path.push(_.last(path_points));

  return new_path;
}

function draw_path(
  p: p5,
  draw_frame: VecScale,
  color: string,
  endpoints: Vector[],
  iters: number,
  stddev: number,
) {
  const u_to_c = draw_frame.bind();

  //create the path
  var path_points = endpoints;

  for (var j = 0; j < iters; j++) {
    path_points = complexify_path(path_points, stddev);
  }

  //draw the path
  p.stroke(color_alpha(p, color, 0.1));
  _.reduce(path_points, (prev: Vector, next: Vector) => {
    const v1 = u_to_c(prev);
    const v2 = u_to_c(next);
    p.line(v1.x, v1.y, v2.x, v2.y);
    return next;
  });
}

function color_alpha(p: p5, color: string, alpha: number): p5.Color {
  if (alpha <= 1) {
    alpha = alpha * 255;
  }

  const result = p.color(color);
  result.setAlpha(alpha);

  return result;
}

//ENDFROM

const RING_DEV = 0.125;
const CHAK_DEV = 0.07;
function draw() {
  p.background(0);

  // Terrible hack, do multiple window resizes to get drawing frame setup.
  if (!hcap) {
    return;
  }
  if (!cap_frame) {
    windowResized();
  }
  if (!cap_frame) {
    return;
  }

  // Draw ring once capture starts
  _.each(_.range(3), () => {
    draw_path(draw_buffer, draw_frame, "white", edge_points(), 6, RING_DEV);
  });

  // draw_cap_frame(p, cap_frame)
  // draw_view_frame(p, draw_frame);

  const cap = hcap?.current;
  if (!cap.result?.poseLandmarks) {
    p.fill(0);
    draw_buffer.clear(0, 0, 0, 0);
    return;
  }

  const l_to_f = draw_frame.bind();
  const pose = _.mapObject(POSE_LANDMARKS, (idx, name) => {
    const landmark = cap.result?.poseLandmarks[idx];
    if (!landmark) {
      return v(NaN, NaN);
    }
    return l_to_f(landmark);
  });

  const chaks = chakra_meta(pose);

  if (chaks.dual && chaks.dual.activated) {
    _.each(_.range(6), () => {
      if (!chaks.dual) {
        return;
      }

      draw_path(
        draw_buffer,
        draw_frame,
        chaks.dual.color,
        cross_points(chaks.dual.idx, NUM_CHAK),
        6,
        CHAK_DEV,
      );
    });
  }

  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_CROWN,
  //     cross_points(0, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_EYE,
  //     cross_points(1, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_THROAT,
  //     cross_points(2, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_HEART,
  //     cross_points(3, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_SOLAR,
  //     cross_points(4, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_SACRAL,
  //     cross_points(5, 7),
  //     6,
  //     CHAK_DEV,
  // );
  // draw_path(
  //     draw_buffer,
  //     draw_frame,
  //     chakra_colors.CHAKRA_ROOT,
  //     cross_points(6, 7),
  //     6,
  //     CHAK_DEV,
  // );

  // @ts-expect-error
  p.image(draw_buffer, 0, 0);

  return;
}

function bind(target: p5) {
  p = target;
  p.setup = setup;
  p.windowResized = windowResized;
  p.draw = draw;
}

export function sphere() {
  return new p5(bind);
}
