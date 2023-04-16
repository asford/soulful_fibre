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
import { HolisticCapture, CapResult } from "./holistic_capture";
import { VecScale, v, VecIsh } from "./vector";

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

    const capture = p.createCapture("VIDEO");
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
    color: string,
    center: p5.Vector,
    d: number,
    b: number,
) {
    p.strokeWeight(0)
        .fill(200)
        .circle(center.x, center.y, d)
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

    if (cap.result?.poseLandmarks) {
        const pose_coords = _.map(cap.result?.poseLandmarks, l_to_f);

        _.map(POSE_LANDMARKS_LEFT, (idx, name) => {
            const loc = pose_coords[idx];
            feature_dot(p, colors.body, loc, 8, 1);
            p.textSize(14)
                .textAlign(p.RIGHT, p.CENTER)
                .text(name, loc.x, loc.y);
        });

        _.map(POSE_LANDMARKS_RIGHT, (idx, name) => {
            const loc = pose_coords[idx];
            feature_dot(p, colors.body, loc, 8, 1);
            p.textSize(14).textAlign(p.LEFT, p.CENTER).text(name, loc.x, loc.y);
        });

        p.stroke(colors.body).strokeWeight(4);
        draw_connections(p, pose_coords, POSE_CONNECTIONS);
    }

    if (cap.result?.faceLandmarks) {
        const face_coords = _.map(cap.result?.faceLandmarks, l_to_f);

        const face_color = p.color(colors.body);
        face_color.setAlpha(25);
        p.stroke(face_color).strokeWeight(1);
        draw_connections(p, face_coords, FACEMESH_TESSELATION);

        _.map(face_coords, (landmark) => {
            feature_dot(p, colors.body, landmark, 2, 1);
        });
    }
}

function draw_hands(
    p: p5,
    colors: PoseColors,
    cap: CapResult,
    draw_frame: VecScale,
) {
    if (cap.result?.rightHandLandmarks) {
        const right_hand_coords = _.map(cap.result?.rightHandLandmarks, l_to_f);

        p.stroke(colors.right).strokeWeight(2);
        draw_connections(p, right_hand_coords, HAND_CONNECTIONS);

        _.map(right_hand_coords, (landmark) => {
            feature_dot(p, colors.right, landmark, 8, 1);
        });
    }

    if (cap.result?.leftHandLandmarks) {
        const left_hand_coords = _.map(cap.result?.leftHandLandmarks, l_to_f);

        p.stroke(colors.left).strokeWeight(2);
        draw_connections(p, left_hand_coords, HAND_CONNECTIONS);

        _.map(left_hand_coords, (landmark) => {
            feature_dot(p, colors.left, landmark, 8, 1);
        });
    }
}

// https://github.com/d3/d3-scale-chromatic#schemeSet2
const colors = {
    body: d3.schemeSet2[0],
    right: d3.schemeSet2[1],
    left: d3.schemeSet2[2],
    grey: d3.schemeSet2[7],
};

function draw_view_frame(p: p5, draw_frame: VecScale) {
    const l_to_f = draw_frame.bind();

    const lower = l_to_f(v(0, 0));
    const upper = l_to_f(v(1, 1));

    p.fill(25)
        .stroke(colors.grey)
        .strokeWeight(2)
        .rectMode(p.CORNERS)
        .rect(lower.x, lower.y, upper.x, upper.y);
}

function draw_cap_count(p: p5, cap: CapResult) {
    p.fill(200)
        .textSize(16)
        .stroke(colors.body)
        .strokeWeight(1)
        .text("f: " + cap.count, 16, 32);
}

function avg_vec(vecs: VecIsh[]) {
    var accum = v(0, 0);
    _.each(vecs, (vec) => {
        if (!vec) {
            return;
        }
        accum.add(vec.x, vec.y, vec.z);
    });
    return accum.div(_.size(vecs));
}

interface PoseCoords {
    NOSE: Vector;
    RIGHT_EYE_INNER: Vector;
    RIGHT_EYE: Vector;
    RIGHT_EYE_OUTER: Vector;
    LEFT_EYE_INNER: Vector;
    LEFT_EYE: Vector;
    LEFT_EYE_OUTER: Vector;
    RIGHT_EAR: Vector;
    LEFT_EAR: Vector;
    MOUTH_RIGHT: Vector;
    MOUTH_LEFT: Vector;
    RIGHT_SHOULDER: Vector;
    LEFT_SHOULDER: Vector;
    RIGHT_ELBOW: Vector;
    LEFT_ELBOW: Vector;
    RIGHT_WRIST: Vector;
    LEFT_WRIST: Vector;
    RIGHT_PINKY: Vector;
    LEFT_PINKY: Vector;
    RIGHT_INDEX: Vector;
    LEFT_INDEX: Vector;
    RIGHT_THUMB: Vector;
    LEFT_THUMB: Vector;
    RIGHT_HIP: Vector;
    LEFT_HIP: Vector;
}

const chakra_colors = {
    CHAKRA_CROWN: "#704089",
    CHAKRA_EYE: "#355B9C",
    CHAKRA_THROAT: "#3C9CC9",
    CHAKRA_HEART: "#29A147",
    CHAKRA_SOLAR: "#DCB512",
    CHAKRA_SACRAL: "#DF6323",
    CHAKRA_ROOT: "#BE1D23",
};

interface ChakraCoords {
    CHAKRA_CROWN: Vector;
    CHAKRA_EYE: Vector;
    CHAKRA_THROAT: Vector;
    CHAKRA_HEART: Vector;
    CHAKRA_SOLAR: Vector;
    CHAKRA_SACRAL: Vector;
    CHAKRA_ROOT: Vector;
}

function chakra_meta(pose: PoseCoords) {
    const EYE_CENTER = avg_vec([pose.LEFT_EYE, pose.RIGHT_EAR]);
    const MOUTH_CENTER = avg_vec([pose.MOUTH_LEFT, pose.MOUTH_RIGHT]);
    const SHOULDER_CENTER = avg_vec([pose.LEFT_SHOULDER, pose.RIGHT_SHOULDER]);
    const HIP_CENTER = avg_vec([pose.LEFT_HIP, pose.RIGHT_HIP]);

    const S_TO_E = EYE_CENTER.copy().sub(SHOULDER_CENTER);
    const H_TO_S = SHOULDER_CENTER.copy().sub(HIP_CENTER);

    const chakra_coords = {
        CHAKRA_CROWN: EYE_CENTER.copy().add(S_TO_E.copy().mult(3 / 4)),
        CHAKRA_EYE: EYE_CENTER.copy(),
        CHAKRA_THROAT: SHOULDER_CENTER.copy().add(S_TO_E.copy().div(4)),
        CHAKRA_HEART: SHOULDER_CENTER.copy().sub(H_TO_S.copy().div(4)),
        CHAKRA_SOLAR: SHOULDER_CENTER.copy().sub(H_TO_S.copy().div(2)),
        CHAKRA_SACRAL: HIP_CENTER.copy().add(H_TO_S.copy().div(4)),
        CHAKRA_ROOT: HIP_CENTER.copy(),
    };

    var meta_coords = {
        EYE_CENTER: EYE_CENTER,
        MOUTH_CENTER: MOUTH_CENTER,
        SHOULDER_CENTER: SHOULDER_CENTER,
        HIP_CENTER: HIP_CENTER,
        S_TO_E: S_TO_E,
        H_TO_S: H_TO_S,
    };

    var act = coord_activation(pose.LEFT_INDEX, chakra_coords);
    var color: string = chakra_colors[act.key];

    return {
        meta: meta_coords,
        coords: chakra_coords,
        colors: chakra_colors,
        close: {
            ...act,
            color: color,
        },
    };
}

function draw_chakra_activation(p: p5, coords: ChakraCoords) {
    _.each(coords, (coord, name) => {
        var act = coord_activation(coords[name], coords, 1e-6);

        feature_ring(p, chakra_colors[name], coord, act.activation_dist, 4);

        // feature_dot(p, chakra_colors[name], coord, 32, 4);

        p.textSize(32)
            .strokeWeight(2)
            .textAlign(p.LEFT, p.CENTER)
            .text(name, coord.x + 45, coord.y);
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

var feature_domain: Vector[];
var render_range: Vector[];

var draw_frame: VecScale;

var draw_buffer: p5;

function windowResized() {
    p.resizeCanvas(p.windowWidth, p.windowHeight);

    screen_size = v(p.width, p.height);
    center = screen_size.copy().div(2);

    if (!hcap) {
        return;
    }

    const cap = hcap.current;

    if (!cap.height || !cap.width) {
        return;
    }

    var cap_size = v(cap.width, cap.height);
    var cap_aspect = cap_size.y / cap_size.x;

    var canvas_scale = Math.min(screen_size.x / 1, screen_size.y / cap_aspect);

    // normalize landmark into a selfy-ish, equally scaled x-y coordinate
    feature_domain = [v(1, 0), v(0, 1)];
    render_range = [
        center
            .copy()
            .add(v(1, cap_aspect).mult(-((canvas_scale * canvas_cover) / 2))),
        center
            .copy()
            .add(v(1, cap_aspect).mult((canvas_scale * canvas_cover) / 2)),
    ];

    draw_frame = VecScale.linear().domain(feature_domain).range(render_range);

    draw_buffer = p.createGraphics(screen_size.x, screen_size.y);
    draw_buffer.clear(0, 0, 0, 0);
}

var position: Vector;
var last_position: Vector;

function draw() {
    // Terrible hack, do multiple window resizes to get drawing frame setup.
    if (!hcap) {
        return;
    }
    if (!draw_frame) {
        windowResized();
    }
    if (!draw_frame) {
        return;
    }

    const cap = hcap?.current;

    p.background(0);
    draw_view_frame(p, draw_frame);

    if (!cap.result?.poseLandmarks) {
        draw_buffer.clear(0, 0, 0, 0);
        return;
    }

    draw_skeleton(p, colors, cap, draw_frame);

    if (!cap.result?.poseLandmarks) {
        p.fill(0);
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

    var SYMMETRY = 8;

    // feature_dot(p, color_alpha(colors.grey, .25), pose.RIGHT_INDEX, 4, 1);

    last_position = position;
    position = pose.RIGHT_INDEX;

    if (chaks.close.activated) {
        draw_buffer
            .stroke(color_alpha(draw_buffer, chaks.close.color, 1))
            .strokeWeight(8)
            .noFill();

        var last_pos = symmetric_points(last_position, center, SYMMETRY);
        var pos = symmetric_points(position, center, SYMMETRY);

        for (let i = 0; i < SYMMETRY; i++) {
            var pfrom = last_pos[i];
            var pto = pos[i];

            draw_buffer.line(pfrom.x, pfrom.y, pto.x, pto.y);
        }
    }

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
function symmetric(point: Vector, c: Vector, angle: number): Vector {
    let u = p5.Vector.fromAngle(angle);
    let pcu = p5.Vector.mult(u, p5.Vector.dot(p5.Vector.sub(c, point), u));
    let symmetricPoint = p5.Vector.sub(c, pcu).mult(2).sub(point);
    return symmetricPoint;
}

// from https://openprocessing.org/sketch/479158

function bind(target: p5) {
    p = target;
    p.setup = setup;
    p.windowResized = windowResized;
    p.draw = draw;
}

export function mandala_draw() {
    return new p5(bind);
}
