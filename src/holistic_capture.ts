import {
  Holistic,
  Results,
  Options,
  FACEMESH_TESSELATION,
  NormalizedLandmark,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  POSE_LANDMARKS,
} from "@mediapipe/holistic";

import * as _ from "underscore";

const media_devices = await navigator.mediaDevices.enumerateDevices();

// Get the first camera, should sensibly default to usb webcam.
export function default_video_constraints() {
  const first_device = _.first(
    _.filter(media_devices, (device) => {
      return device.kind == "videoinput";
    }),
  );
  return {
    video: {
      deviceId: first_device?.deviceId,
    },
    audio: false,
  };
}

export interface CapResult {
  time: number;
  count: number;

  height: number;
  width: number;
  result?: Results;
  coords?: ResultCoords;
}

export interface NormalizedCoord {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// Landmark coordinates, normalized into a image reference frame.
// The center of the image is defined as [0.0, 0.0].
// The visible image spans the x range [-1.0, 1.0],
// with x, y, z in equivalent units.
// The visible image therefor spans a y range dependent on the image aspect ratio.
export interface ResultCoords {
  pose_coords?: NormalizedCoord[];
  face_coords?: NormalizedCoord[];
  right_hand_coords?: NormalizedCoord[];
  left_hand_coords?: NormalizedCoord[];
}

export const DEFAULT_OPTIONS: Options = {
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: true,
  smoothSegmentation: true,
  refineFaceLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

interface CaptureCallback {
  (result: CapResult, previous?: CapResult): void;
}
export class HolisticCapture {
  holistic: Holistic;
  current: CapResult;
  callback_list: CaptureCallback[];

  on_result(callback: CaptureCallback) {
    this.callback_list.push(callback);
  }

  store_result(results: Results) {
    const cap_result: CapResult = {
      result: results,
      coords: this.normalize_result(results),
      time: performance.now(),
      count: this.current.count + 1,
      height: results.image.height,
      width: results.image.width,
    };
    const prev = this.current;
    this.current = cap_result;

    _.each(this.callback_list, (callback) => callback(this.current, prev));
  }

  normalize_result(results: Results | undefined): ResultCoords | undefined {
    if (!results) {
      return;
    }

    const aspect_ratio = results.image.height / results.image.width;

    const norm_landmark = (lm: NormalizedLandmark): NormalizedCoord => {
      return {
        x: 2 * lm.x - 1,
        y: (2 * lm.y - 1) * aspect_ratio,
        z: lm.z,
        visibility: lm.visibility,
      };
    };

    return {
      pose_coords: results.poseLandmarks
        ? _.map(results.poseLandmarks, norm_landmark)
        : undefined,
      face_coords: results.faceLandmarks
        ? _.map(results.faceLandmarks, norm_landmark)
        : undefined,
      right_hand_coords: results.rightHandLandmarks
        ? _.map(results.rightHandLandmarks, norm_landmark)
        : undefined,
      left_hand_coords: results.leftHandLandmarks
        ? _.map(results.leftHandLandmarks, norm_landmark)
        : undefined,
    };
  }

  constructor(
    video_element?: HTMLVideoElement,
    options: Options = DEFAULT_OPTIONS,
  ) {
    this.callback_list = [];

    this.current = {
      time: performance.now(),
      count: 0,
      height: 0,
      width: 0,
    };

    this.holistic = new Holistic({
      locateFile: (file:string) => {
        var urlpath = `${import.meta.env.BASE_URL}/mediapipe_assets/holistic/${file}`
        console.log("locateFile", file, urlpath);
        return urlpath;
        // return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
      },
    });

    this.holistic.onResults((result: Results) => {
      this.store_result(result);
    });
    this.holistic.setOptions(options);

    if (video_element) {
      this.attach_video(video_element);
    }
  }

  attach_video(
    video_element: HTMLVideoElement,
  ) {
    console.log("holisic attach_video", video_element);
    const video_callback = async () => {
      await this.holistic.send({ image: video_element });
      video_element.requestVideoFrameCallback(video_callback);
    };

    video_element.requestVideoFrameCallback(video_callback);
  }
}
