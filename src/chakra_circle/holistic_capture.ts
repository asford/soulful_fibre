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

export class HolisticCapture {
  holistic: Holistic;
  current: CapResult;

  store_result(results: Results) {
    this.current = {
      result: results,
      time: performance.now(),
      count: this.current.count + 1,
      height: results.image.height,
      width: results.image.width,
    };
  }

  constructor(
    video_element: HTMLVideoElement,
    options: Options = DEFAULT_OPTIONS,
  ) {
    this.current = {
      time: performance.now(),
      count: 0,
      height: 0,
      width: 0,
    };

    this.holistic = new Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
      },
    });

    this.holistic.onResults((result: Results) => {
      this.store_result(result);
    });
    this.holistic.setOptions(options);

    const video_callback = async (now, metadata) => {
      await this.holistic.send({ image: video_element });
      video_element.requestVideoFrameCallback(video_callback);
    };

    video_element.requestVideoFrameCallback(video_callback);
  }
}
