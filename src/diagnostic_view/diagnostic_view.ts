import {
  NormalizedLandmark,
  NormalizedLandmarkListList,
  FACEMESH_TESSELATION,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  POSE_LANDMARKS,
  POSE_LANDMARKS_LEFT,
  POSE_LANDMARKS_RIGHT,
  POSE_LANDMARKS_NEUTRAL,
} from "@mediapipe/holistic";
import * as d3 from "d3";
import p5, { Vector } from "p5";
import _ from "underscore";
import {
  default_video_constraints,
  HolisticCapture,
  CapResult,
} from "./holistic_capture";
import { VecScale, v, VecIsh } from "./vector";

import { chakra_colors, ChakraCoords, chakra_meta } from "./chakra_common";
import { not } from "taichi.js/dist/taichi";
import { applyProps } from "@react-three/fiber/dist/declarations/src/core/utils";

const media_devices = await navigator.mediaDevices.enumerateDevices();

interface CWheel {
  center: Vector;
  unit_r: Vector;
  radius: number;
  h_angle: number;
  v_angle: number;
}

function wheel_control(from_vec: p5.Vector, to_vec: p5.Vector): CWheel {
  const center = to_vec.copy().add(from_vec).div(2);
  const delta = to_vec.copy().sub(from_vec).div(2);
  const radius = delta.mag();
  const unit_r = delta.normalize();

  const y_unit = new p5.Vector(0, 1);
  const x_unit = new p5.Vector(0, 1);

  const v_angle = unit_r.angleBetween(y_unit);
  const h_angle = unit_r.angleBetween(x_unit);

  return {
    center: center,
    unit_r: unit_r,
    radius: radius,
    h_angle: h_angle,
    v_angle: v_angle,
  };
}

function getColorVector(p: p5, c: p5.Color): Vector {
  return v(p.red(c), p.green(c), p.blue(c));
}

function rainbowColorBase(p: p5): p5.Color[] {
  return [
    p.color("red"),
    p.color("orange"),
    p.color("yellow"),
    p.color("green"),
    p.color(38, 58, 150), // blue
    p.color("indigo"),
    p.color("violet"),
  ];
}

function getColorsArray(
  p: p5,
  total: number,
  baseColorArray?: p5.Color[],
): p5.Color[] {
  if (!baseColorArray) {
    baseColorArray = rainbowColorBase(p);
  }
  var rainbowColors = baseColorArray.map((x) => getColorVector(p, x));

  let colours = new Array<p5.Color>();
  for (var i = 0; i < total; i++) {
    var colorPosition = i / total;
    var scaledColorPosition = colorPosition * (rainbowColors.length - 1);

    var colorIndex = Math.floor(scaledColorPosition);
    var colorPercentage = scaledColorPosition - colorIndex;

    var nameColor = getColorByPercentage(
      rainbowColors[colorIndex],
      rainbowColors[colorIndex + 1],
      colorPercentage,
    );

    colours.push(p.color(nameColor.x, nameColor.y, nameColor.z));
  }

  return colours;
}

function getColorByPercentage(
  firstColor: p5.Vector,
  secondColor: p5.Vector,
  percentage: number,
): Vector {
  // assumes colors are p5js vectors
  var firstColorCopy = firstColor.copy();
  var secondColorCopy = secondColor.copy();

  var deltaColor = secondColorCopy.sub(firstColorCopy);
  var scaledDeltaColor = deltaColor.mult(percentage);
  return firstColorCopy.add(scaledDeltaColor);
}

function draw_poly(p: p5, numberOfSides: number, width: number) {
  var TWO_PI = p.TWO_PI;

  p.push();
  const angle = TWO_PI / numberOfSides;
  const radius = width / 2;
  p.beginShape();
  for (let a = 0; a < TWO_PI; a += angle) {
    let sx = p.cos(a) * radius;
    let sy = p.sin(a) * radius;
    p.vertex(sx, sy);
  }
  p.endShape(p.CLOSE);
  p.pop();
}

var FPS: number = 30;
var hcap: HolisticCapture;
var p: p5;

function setup() {
  p.createCanvas(0, 0);
  p.frameRate(FPS);
  windowResized();

  const capture = p.createCapture(default_video_constraints());
  capture.hide();

  hcap = new HolisticCapture(capture.elt);
}

interface PoseColors {
  body: string;
  right: string;
  left: string;
}

function feature_dot(
  p: p5,
  color: string | p5.Color,
  center: p5.Vector,
  d: number,
  b: number,
) {
  p.strokeWeight(0)
    .fill(200)
    .circle(center.x, center.y, d)
    // @ts-expect-error
    .fill(color)
    .circle(center.x, center.y, d - b);
}

function feature_ring(
  p: p5,
  color: string | p5.Color,
  center: Vector,
  d: number,
  weight: number,
) {
  // @ts-expect-error
  p.noFill().stroke(color).strokeWeight(weight).circle(center.x, center.y, d);
}

function draw_connections(
  p: p5,
  landmarks: VecIsh[],
  connections: Iterable<[number, number]>,
) {
  _.map(connections, (edge) => {
    const start = landmarks[edge[0]];
    const end = landmarks[edge[1]];
    p.line(start.x, start.y, end.x, end.y);
  });
}

function draw_skeleton(
  p: p5,
  colors: PoseColors,
  cap: CapResult,
  draw_frame: VecScale,
) {
  const l_to_f = draw_frame.bind();

  if (cap.coords?.pose_coords) {
    const pose_coords = _.map(cap.coords.pose_coords, l_to_f);

    _.map(POSE_LANDMARKS_LEFT, (idx, name) => {
      const loc = pose_coords[idx];
      feature_dot(p, colors.body, loc, 8, 1);
      p.textSize(14).textAlign(p.RIGHT, p.CENTER).text(name, loc.x, loc.y);
    });

    _.map(POSE_LANDMARKS_RIGHT, (idx, name) => {
      const loc = pose_coords[idx];
      feature_dot(p, colors.body, loc, 8, 1);
      p.textSize(14).textAlign(p.LEFT, p.CENTER).text(name, loc.x, loc.y);
    });

    p.stroke(colors.body).strokeWeight(4);
    draw_connections(p, pose_coords, POSE_CONNECTIONS);
  }

  if (cap.coords?.face_coords) {
    const face_coords = _.map(cap.coords.face_coords, l_to_f);

    const face_color = p.color(colors.body);
    face_color.setAlpha(25);
    p.stroke(face_color).strokeWeight(1);
    draw_connections(p, face_coords, FACEMESH_TESSELATION);

    _.map(face_coords, (landmark) => {
      feature_dot(p, colors.body, landmark, 2, 1);
    });
  }

  console.log("right", cap.coords?.right_hand_coords);
  function draw_hand(coords: any, color: any) {
    if (coords) {
      const hand_coords = _.map(coords, l_to_f);

      p.stroke(color_alpha(p, p.color(color), 200)).strokeWeight(10);
      draw_connections(p, hand_coords, HAND_CONNECTIONS);

      _.map(hand_coords, (landmark) => {
        feature_dot(p, color, landmark, 4, 2);
      });
    }
  }
  draw_hand(cap.coords?.right_hand_coords, colors.right);
  draw_hand(cap.coords?.left_hand_coords, colors.left);
}

// https://github.com/d3/d3-scale-chromatic#schemeSet2
const colors = {
  body: d3.schemeSet2[0],
  right: d3.schemeSet2[1],
  left: d3.schemeSet2[2],
  grey: d3.schemeSet2[7],
};

function draw_view_frame(p: p5, cap_aspect: number, draw_frame: VecScale) {
  const l_to_f = draw_frame.bind();

  const lower = l_to_f(v(-1, -cap_aspect));
  const upper = l_to_f(v(1, cap_aspect));

  p.fill(25)
    .stroke(colors.grey)
    .strokeWeight(2)
    .rectMode(p.CORNERS)
    .rect(lower.x, lower.y, upper.x, upper.y);
}

function draw_capture_image(p: p5, cap: CapResult, draw_frame: VecScale) {
  const l_to_f = draw_frame.bind();

  const cap_aspect = cap.height / cap.width;

  const tl = l_to_f(v(1, -1 * cap_aspect));
  const lr = l_to_f(v(-1, 1 * cap_aspect));

  if (!cap.result?.image) {
    return;
  }

  // Copy buffer info p5 image buffer
  // use negative width to flip x for mirror effect
  const w = lr.x - tl.x;
  const h = lr.y - tl.y;

  // flip x scale for selfie image
  p.drawingContext.scale(-1, 1);
  p.drawingContext.drawImage(
    cap.result?.image,
    // 0,
    // 0,
    // cap.result?.image.width,
    // cap.result?.image.height,
    -tl.x,
    tl.y,
    -(lr.x - tl.x),
    lr.y - tl.y,
  );
  p.drawingContext.scale(-1, 1);
}

function draw_cap_count(p: p5, cap: CapResult) {
  p.fill(200)
    .textSize(16)
    .stroke(colors.body)
    .strokeWeight(1)
    .text("f: " + cap.count, 16, 32);
}

function draw_chakra_activation(p: p5, coords: ChakraCoords) {
  _.each(coords, (coord: VecIsh, name) => {
    // @ts-expect-error
    var act = coord_activation(coords[name], coords, 1e-6);

    // @ts-expect-error
    feature_ring(p, chakra_colors[name], coord, act.activation_dist, 4);

    // feature_dot(p, chakra_colors[name], coord, 32, 4);

    p.textSize(32)
      .strokeWeight(2)
      .textAlign(p.LEFT, p.CENTER)
      .text(name, coord.x + 45, coord.y);
  });
}

function color_alpha(p: p5, color: p5.Color | string, alpha: number): p5.Color {
  if (alpha <= 1) {
    alpha = alpha * 255;
  }

  // @ts-expect-error
  const result = p.color(color);
  result.setAlpha(alpha);

  return result;
}

function closest_coord(
  point: Vector,
  coords: { [name: string]: Vector },
  thresh: number = 0,
) {
  var current = {
    key: "",
    dist: Infinity,
  };

  _.each(coords, (val, key) => {
    const pdist = point.dist(val);

    if (pdist < current.dist && pdist > thresh) {
      current.key = key;
      current.dist = pdist;
    }
  });

  return current;
}

function coord_activation(point: Vector, coords: { [name: string]: Vector }) {
  const closest = closest_coord(point, coords, -1);

  const closest_other = closest_coord(coords[closest.key], coords, 1e-6);

  const activation_dist = closest_other.dist;

  return {
    key: closest.key,
    dist: closest.dist,
    activation_dist: activation_dist,
    activated: closest.dist < activation_dist,
  };
}

function symmetric_points(
  point: Vector,
  center: Vector,
  symmetry: number,
): Vector[] {
  var points = [];
  var step = p.TAU / symmetry;

  for (var a = 0; a < symmetry; a++) {
    points.push(
      point
        .copy()
        .sub(center)
        .rotate(a * step)
        .add(center),
    );
  }

  return points;
}

var screen_size: Vector;
var center: Vector;
var canvas_scale: number;
var canvas_cover: number = 0.9;

var draw_frame: VecScale;

var draw_buffer: p5.Graphics;

function windowResized() {
  p.resizeCanvas(p.windowWidth, p.windowHeight);
  screen_size = v(p.width, p.height);
  draw_buffer = p.createGraphics(screen_size.x, screen_size.y);
  draw_buffer.clear(0, 0, 0, 0);
}

var position: Vector;
var last_position: Vector;

function draw() {
  if (!hcap) {
    return;
  }

  const cap = hcap.current;

  if (!cap.height || !cap.width) {
    return;
  }

  var cap_size = v(cap.width, cap.height);
  var cap_aspect = cap_size.y / cap_size.x;

  var pose_coord_scale = _.min([
    (canvas_cover * screen_size.x) / (2 * 1),
    (canvas_cover * screen_size.y) / (2 * cap_aspect),
  ]);

  // normalize landmark into a selfy-ish, equally scaled x-y coordinate
  const window_range = [
    v(-pose_coord_scale, -pose_coord_scale)
      .mult(-1, 1)
      .add(screen_size.x / 2, screen_size.y / 2),
    v(pose_coord_scale, pose_coord_scale)
      .mult(-1, 1)
      .add(screen_size.x / 2, screen_size.y / 2),
  ];

  draw_frame = VecScale.linear()
    .domain([v(-1, -1), v(1, 1)])
    .range(window_range);

  p.background(0);

  draw_view_frame(p, cap_aspect, draw_frame);
  draw_capture_image(p, cap, draw_frame);

  if (!cap.result?.poseLandmarks) {
    draw_buffer.clear(0, 0, 0, 0);
    return;
  }

  draw_skeleton(p, colors, cap, draw_frame);

  if (!cap.coords?.pose_coords) {
    p.fill(0);
    return;
  }

  const l_to_f = draw_frame.bind();

  // Maybe fold into pose
  const pose = _.mapObject(POSE_LANDMARKS, (idx, name) => {
    const landmark = (cap.coords?.pose_coords ?? [])[idx];
    if (!landmark) {
      return v(NaN, NaN);
    }
    return v(landmark.x, landmark.y);
  });

  const chaks = chakra_meta(pose);

  draw_chakra_activation(
    p,
    _.mapObject(chaks.coords, (coord, name) => {
      return l_to_f(coord);
    }),
  );

  feature_dot(p, color_alpha(p, colors.grey, 0.25), pose.RIGHT_INDEX, 4, 1);

  // last_position = position;
  // position = pose.RIGHT_INDEX;

  // var SYMMETRY = 8;

  //   if (chaks.close.activated) {
  //     draw_buffer
  //       .stroke(color_alpha(draw_buffer, chaks.close.color, 1))
  //       .strokeWeight(8)
  //       .noFill();

  //     var last_pos = symmetric_points(last_position, center, SYMMETRY);
  //     var pos = symmetric_points(position, center, SYMMETRY);

  //     for (let i = 0; i < SYMMETRY; i++) {
  //       var pfrom = last_pos[i];
  //       var pto = pos[i];

  //       draw_buffer.line(pfrom.x, pfrom.y, pto.x, pto.y);
  //     }
  //   }

  p.image(draw_buffer, 0, 0);

  // p.stroke(chaks.close.color);
  // var from = last_position;
  // var to = position;
  // p.line(from.x, from.y, to.x, to.y);

  // for (let a = 0; a < p.TAU; a += p.TAU / symmetry) {
  //     from = symmetric(last_position, center, a);
  //     to = symmetric(position, center, a);

  //     line(from.x, from.y, to.x, to.y);
  // }
}

// Calculate the symmetric of a point with respect to a line defined by a point(c) and a vector(u)
// function symmetric(point: Vector, c: Vector, angle: number): Vector {
//   let u = p5.Vector.fromAngle(angle);
//   let pcu = p5.Vector.mult(u, p5.Vector.dot(p5.Vector.sub(c, point), u));
//   let symmetricPoint = p5.Vector.sub(c, pcu).mult(2).sub(point);
//   return symmetricPoint;
// }

// from https://openprocessing.org/sketch/479158

function bind(target: p5) {
  p = target;
  p.setup = setup;
  p.windowResized = windowResized;
  p.draw = draw;
}

export function diagnostic_view() {
  return new p5(bind);
}
