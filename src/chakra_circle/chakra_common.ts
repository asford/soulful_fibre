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
import { HolisticCapture, CapResult } from "../holistic_capture";

import { Vector } from "p5";
import { VecScale, v, VecIsh } from "./vector";
import _ from "underscore";
import p5 from "p5";

export interface PoseCoords {
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

export interface PoseColors {
    body: string;
    right: string;
    left: string;
}

export const chakra_colors = {
    CHAKRA_CROWN: "#704089",
    CHAKRA_EYE: "#355B9C",
    CHAKRA_THROAT: "#3C9CC9",
    CHAKRA_HEART: "#29A147",
    CHAKRA_SOLAR: "#DCB512",
    CHAKRA_SACRAL: "#DF6323",
    CHAKRA_ROOT: "#BE1D23",
};

export const chakra_idx = {
    CHAKRA_CROWN: 0,
    CHAKRA_EYE: 1,
    CHAKRA_THROAT: 2,
    CHAKRA_HEART: 3,
    CHAKRA_SOLAR: 4,
    CHAKRA_SACRAL: 5,
    CHAKRA_ROOT: 6,
};

export const NUM_CHAK = 7;

export interface ChakraCoords {
    CHAKRA_CROWN: Vector;
    CHAKRA_EYE: Vector;
    CHAKRA_THROAT: Vector;
    CHAKRA_HEART: Vector;
    CHAKRA_SOLAR: Vector;
    CHAKRA_SACRAL: Vector;
    CHAKRA_ROOT: Vector;
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

export function chakra_meta(pose: PoseCoords) {
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

    function get_activation(coord: Vector) {
        var act = coord_activation(coord, chakra_coords);
        // @ts-expect-error
        var color: string = chakra_colors[act.key];
        // @ts-expect-error
        var idx: number = chakra_idx[act.key];

        return {
            ...act,
            color: color,
            idx: idx,
        };
    }

    const left_activation = get_activation(pose.LEFT_INDEX);
    const right_activation = get_activation(pose.RIGHT_INDEX);

    var dual_activation;
    if (left_activation.idx == right_activation.idx) {
        dual_activation = {
            key: left_activation.key,
            activated: left_activation.activated && right_activation.activated,
            color: left_activation.color,
            idx: left_activation.idx,
        }
    }

    pose.LEFT_INDEX;
    return {
        meta: meta_coords,
        coords: chakra_coords,
        colors: chakra_colors,
        right: right_activation,
        left: left_activation,
        dual: dual_activation,
    };
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

export function cap_to_pose_coords(
    p: p5,
    cap: CapResult,
    cap_landmark_frame: VecScale,
): PoseCoords {
    const l_to_f = cap_landmark_frame.bind();

    return _.mapObject(POSE_LANDMARKS, (idx: number, name: string) => {
        const landmark = cap.result?.poseLandmarks[idx];
        if (!landmark) {
            return v(NaN, NaN);
        }
        return l_to_f(landmark);
    });
}

export function draw_chakra_activation(p: p5, coords: ChakraCoords) {
    _.each(coords, (coord: Vector, name: string) => {
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
