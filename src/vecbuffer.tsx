import { Vector3 } from "three";

function randomGaussian() {
  // https://github.com/scijs/gauss-random/blob/master/sample.js
  return (
    Math.sqrt(-2.0 * Math.log(Math.random())) *
    Math.cos(2.0 * Math.PI * Math.random())
  );
}

interface ArrayLike<T> {
  readonly length: number;
  [n: number]: T;
}

export class Vec3Buffer {
  size: number;

  constructor(public data: ArrayLike<number>) {
    if (data.length % 3 != 0) {
      throw new Error("Invalid data length");
    }

    this.size = data.length / 3;
  }

  static view(data: ArrayLike<number>): Vec3Buffer {
    return new Vec3Buffer(data);
  }

  static empty(size: number): Vec3Buffer {
    return new Vec3Buffer(new Float32Array(3 * size));
  }

  get(i: number, into: THREE.Vector3): THREE.Vector3 {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * 3;

    into.x = this.data[offset + 0];
    into.y = this.data[offset + 1];
    into.z = this.data[offset + 2];
    return into;
  }

  set(i: number, vec: THREE.Vector3) {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * 3;

    this.data[offset + 0] = vec.x;
    this.data[offset + 1] = vec.y;
    this.data[offset + 2] = vec.z;
  }
}

function _complexify_path(
  path: Vec3Buffer,
  dev: number,
  si: number,
  sv: Vector3,
  ei: number,
  ev: Vector3,
  work: Vector3,
) {
  const mid = si + Math.floor((ei - si) / 2);
  if (mid <= si) {
    return path;
  }

  path.get(mid, work);

  work.addVectors(sv, ev).divideScalar(2);

  const stddev = dev * sv.distanceTo(work) * 2;

  work.x += randomGaussian() * stddev;
  work.y += randomGaussian() * stddev;
  work.z += randomGaussian() * stddev;

  path.set(mid, work);

  _complexify_path(path, dev, si, sv, mid, ev.copy(work), work);
  _complexify_path(path, dev, mid, sv.copy(ev), ei, path.get(ei, ev), work);

  return path;
}

export function complexify_path(
  path: Vec3Buffer,
  start: number,
  end: number,
  dev: number,
) {
  return _complexify_path(
    path,
    dev,
    start,
    path.get(start, new Vector3()),
    end,
    path.get(end, new Vector3()),
    new Vector3(),
  );
}
