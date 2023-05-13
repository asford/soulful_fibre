import { Vector2, Vector3, Vector4 } from "three";

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

export class Vec4Buffer {
  itemsize: number = 4;
  size: number;
  data: ArrayLike<number>;

  constructor(data?: ArrayLike<number>) {
    if (!data) {
      data = new Float32Array(0);
    }

    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  set_data(data: ArrayLike<number>) {
    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  static view(data: ArrayLike<number>): Vec4Buffer {
    return new Vec4Buffer(data);
  }

  static empty(size: number): Vec4Buffer {
    const result = new Vec4Buffer();
    result.set_data(new Float32Array(result.itemsize * size));
    return result;
  }

  get(i: number, into?: THREE.Vector4): THREE.Vector4 {
    if(!into) {
      into = new Vector4();
    }

    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;

    return into.fromArray(this.data, offset);
  }

  set(i: number, vec: THREE.Vector4) {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;
    vec.toArray(this.data, offset);
  }

  deep_copy(): Vec4Buffer {
    return new Vec4Buffer(new Float32Array(this.data));
  }

  data_array(): Float32Array {
    if (this.data instanceof Float32Array) {
      return this.data;
    } else {
      return this.deep_copy().data_array();
    }
  }
}

export class Vec3Buffer {
  itemsize: number = 3;
  size: number;
  data: ArrayLike<number>;

  constructor(data?: ArrayLike<number>) {
    if (!data) {
      data = new Float32Array(0);
    }

    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  set_data(data: ArrayLike<number>) {
    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  static view(data: ArrayLike<number>): Vec3Buffer {
    return new Vec3Buffer(data);
  }

  static empty(size: number): Vec3Buffer {
    const result = new Vec3Buffer();
    result.set_data(new Float32Array(result.itemsize * size));
    return result;
  }

  get(i: number, into?: THREE.Vector3): THREE.Vector3 {
    if(!into) {
      into = new Vector3();
    }

    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;

    return into.fromArray(this.data, offset);
  }

  set(i: number, vec: THREE.Vector3) {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;
    vec.toArray(this.data, offset);
  }

  deep_copy(): Vec3Buffer {
    return new Vec3Buffer(new Float32Array(this.data));
  }

  data_array(): Float32Array {
    if (this.data instanceof Float32Array) {
      return this.data;
    } else {
      return this.deep_copy().data_array();
    }
  }
}

export class Vec2Buffer {
  itemsize: number = 2;
  size: number;
  data: ArrayLike<number>;

  constructor(data?: ArrayLike<number>) {
    if (!data) {
      data = new Float32Array(0);
    }

    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  set_data(data: ArrayLike<number>) {
    if (data.length % this.itemsize != 0) {
      throw new Error("Invalid data length");
    }

    this.data = data;
    this.size = data.length / this.itemsize;
  }

  static view(data: ArrayLike<number>): Vec2Buffer {
    return new Vec2Buffer(data);
  }

  static empty(size: number): Vec2Buffer {
    const result = new Vec2Buffer();
    result.set_data(new Float32Array(result.itemsize * size));
    return result;
  }

  get(i: number, into?: THREE.Vector2): THREE.Vector2 {
    if(!into) {
      into = new Vector2();
    }

    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;

    return into.fromArray(this.data, offset);
  }

  set(i: number, vec: THREE.Vector2) {
    if (i < 0 || i >= this.size) {
      throw new Error("Invalid index");
    }

    const offset = i * this.itemsize;
    vec.toArray(this.data, offset);
  }

  deep_copy(): Vec2Buffer {
    return new Vec2Buffer(new Float32Array(this.data));
  }

  data_array(): Float32Array {
    if (this.data instanceof Float32Array) {
      return this.data;
    } else {
      return this.deep_copy().data_array();
    }
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
