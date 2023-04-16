import { Holistic, HolisticConfig, Results, FACEMESH_TESSELATION, NormalizedLandmark, HAND_CONNECTIONS, POSE_CONNECTIONS, POSE_LANDMARKS } from "@mediapipe/holistic"
import p5 from "p5"

import { Camera } from "@mediapipe/camera_utils";
interface CapResult {
    result: Results | null;
    time: number;
    count: number;

    height: number;
    width: number;
}

interface Vec2 {
    x: number
    y: number
}

interface CWheel {
    center: p5.Vector;
    unit_r: p5.Vector;
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
    }
}

function sketch(p: p5) {

    const FPS: number = 60;
    var camera: Camera;

    var current: CapResult = {
        result: null,
        time: p.millis(),
        count: 0,
        height: 0,
        width: 0,
    }

    function onResults(results: Results) {
        current = {
            result: results,
            time: p.millis(),
            count: current.count + 1,
            height: results.image.height,
            width: results.image.width,
        };
    };

    function fit_canvas() {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    }
    function setup() {
        p.createCanvas(0, 0);
        fit_canvas()
        p.frameRate(FPS);

        const capture = p.createCapture("VIDEO");
        capture.hide();
        const videoElement: HTMLVideoElement = capture.elt;

        const holistic = new Holistic({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
            },
        });

        holistic.onResults(onResults);
        holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: true,
            smoothSegmentation: true,
            refineFaceLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        camera = new Camera(
            videoElement,
            {
                onFrame: async () => {
                    await holistic.send({ image: videoElement });
                },
                width: 1280,
                height: 720,
            }
        );
        camera.start();
    };

    function draw() {
        var screen_size = new p5.Vector(p.width, p.height);
        var center = screen_size.div(2);
        var canvas_scale = Math.min(p.width, p.height);
        // https://colorbrewer2.org/#type=qualitative&scheme=Set3&n=7

        function norm_vec(lm: NormalizedLandmark | undefined): p5.Vector {
            if (!lm){
                return p.createVector(NaN, NaN);
            }

            return p.createVector(
                1 - lm.x,
                lm.y * (current.height / current.width),
            );
        }

        const half = p.createVector(.5, .5);
        // Return landmark in global canvas frame
        // Mirror x for selfie mode.
        function r_to_frame(lm: NormalizedLandmark): p5.Vector {
            return norm_vec(lm).sub(half).mult(canvas_scale).add(center);
        }

        function norm_to_frame(vec: p5.Vector) {
            return vec.copy().sub(half).mult(canvas_scale).add(center);

        };
        function dot(color: string, center: p5.Vector, d: number, b: number) {
            p.fill(200).circle(
                center.x, center.y, d,
            ).fill(color).circle(
                center.x, center.y, d - b,
            )
        }

        p.background(0);

        p.fill(200).textSize(16).text("f: " + current.count, 16, 32);

        const colors = {
            grey: "#888883",
            straw: "#ffffb3",
            right: "#fb8072",
            left: "#80b1d3",
        }

        const swheel = wheel_control(
            norm_vec(current.result?.poseLandmarks[POSE_LANDMARKS.RIGHT_THUMB]),
            norm_vec(current.result?.poseLandmarks[POSE_LANDMARKS.LEFT_THUMB]),
        );

        dot(colors.grey, norm_to_frame(swheel.center), swheel.radius * canvas_scale * 2, 10);
        p.text(
            swheel.h_angle,
            norm_to_frame(swheel.center).x,
            norm_to_frame(swheel.center).y,
        );


        if (current.result?.poseLandmarks) {
            POSE_CONNECTIONS.forEach((edge) => {
                const fp = current.result?.poseLandmarks[edge[0]];
                const tp = current.result?.poseLandmarks[edge[1]];

                const f = r_to_frame(fp);
                const t = r_to_frame(tp);

                p.stroke(colors.straw).line(
                    f.x, f.y, t.x, t.y
                );
            }
            );
        }

        current.result?.poseLandmarks?.forEach((landmark) => {
            dot(colors.straw, r_to_frame(landmark), 24, 4);
        });

        current.result?.faceLandmarks?.forEach((landmark) => {
            dot(colors.straw, r_to_frame(landmark), 4, 1);
        });

        current.result?.rightHandLandmarks?.forEach((landmark) => {
            dot(colors.right, r_to_frame(landmark), 24, 4);
        });

        current.result?.leftHandLandmarks?.forEach((landmark) => {
            dot(colors.left, r_to_frame(landmark), 24, 4);
        });

    }

    p.setup = setup;
    p.draw = draw;
    p.windowResized = fit_canvas;
};

export function hack_demo() {
    return new p5(sketch);
};