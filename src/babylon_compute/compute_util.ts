import * as BABYLON from "@babylonjs/core";
import * as _ from "lodash";

import { WgslReflect } from "../wgsl_reflect/wgsl_reflect";

function is_any(v: any, types: any[]): boolean {
  return _.some(
    _.map(types, (t) => {
      if (v instanceof t) {
        return true;
      } else {
        return false;
      }
    }),
  );
}

export type FloatArray = number[] | Float32Array;

export interface Bufferable {
  toArray(array: FloatArray, index?: number): this;
  fromArray(array: FloatArray, index?: number): this;
  asArray(): number[];
}

export interface BufferableStruct {
  [key: string]: number | Bufferable;
}

export function value_size(value: number | Bufferable): number {
  if (typeof value === "number") {
    return 1;
  } else {
    return value.asArray().length;
  }
}

export interface FieldMeta {
  name: string;
  size: number;
  offset: number;
}

export function struct_meta<V extends BufferableStruct>(proto: V): FieldMeta[] {
  var offset = 0;

  const result = _.map(proto, (value, name) => {
    const size = value_size(value);

    const field = {
      name: name,
      size: size,
      offset: offset,
    };

    offset += size;

    return field;
  });

  return result;
}

class RecordMeta<V extends BufferableStruct> {
  proto: V;
  fields: FieldMeta[];
  record_size: number;

  constructor(proto: V) {
    this.proto = proto;
    this.fields = struct_meta(proto);
    this.record_size = 0;
    _.each(this.fields, (field: FieldMeta) => {
      this.record_size += field.size;
    });
  }

  asArray(val: V): number[] {
    const result: number[] = new Array(this.record_size);
    this.toArray(result, 0, val);
    return result;
  }

  toArray(array: FloatArray, idx: number, val: V) {
    _.each(this.fields, (field) => {
      const loc = idx * this.record_size + field.offset;
      const fval = val[field.name];

      if (typeof fval === "number") {
        array[loc] = fval;
      } else {
        return fval.toArray(array, loc);
      }
    });
  }

  fromArray(array: FloatArray, idx: number, into?: V): V {
    if (!into) {
      into = _.cloneDeep(this.proto);
    }

    _.each(this.fields, (field) => {
      const loc = idx * this.record_size + field.offset;
      if (field.size == 1) {
        // @ts-expect-error
        into[field.name] = array[loc];
      } else {
        // @ts-expect-error
        into[field.name].fromArray(array, loc);
      }
    });

    return into;
  }
}

export class StorageAdapter<V extends BufferableStruct> {
  meta: RecordMeta<V>;

  size: number;

  source_buffer: Float32Array;

  storage_buffer: BABYLON.StorageBuffer;
  vertex_buffers: BABYLON.VertexBuffer[];

  constructor(
    proto: V,
    size: number,
    engine: BABYLON.Engine,
    vertex_name_prefix: string,
  ) {
    this.meta = new RecordMeta(proto);
    this.size = size;

    // Allocate CPU-resident source buffer
    // and setup associated field views.
    this.source_buffer = new Float32Array(size * this.meta.record_size);

    _.each(_.range(this.size), (idx) => this.set(idx, proto));

    this.storage_buffer = new BABYLON.StorageBuffer(
      engine,
      this.source_buffer.byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
    );

    if (this.meta.record_size % 2 != 0) {
      throw Error("Record sizes must be even mult of 2?!");
    }

    this.vertex_buffers = _.map(this.meta.fields, (field) => {
      const data = this.storage_buffer.getBuffer();
      return new BABYLON.VertexBuffer(
        engine,
        data,
        // kind specifies the vertex buffer name
        vertex_name_prefix + field.name,
        false,
        false,
        this.meta.record_size,
        true,
        field.offset,
        field.size,
      );
    });
  }
  update() {
    this.storage_buffer.update(this.source_buffer);
  }

  get(idx: number, into?: V): V {
    return this.meta.fromArray(this.source_buffer, idx, into);
  }

  set(idx: number, val: V) {
    this.meta.toArray(this.source_buffer, idx, val);
  }
}

export class UniformAdapter<V extends BufferableStruct> {
  meta: RecordMeta<V>;
  buffer: BABYLON.UniformBuffer;

  constructor(proto: V, engine: BABYLON.Engine, name: string) {
    this.meta = new RecordMeta(proto);

    this.buffer = new BABYLON.UniformBuffer(engine, undefined, undefined, name);

    _.each(this.meta.fields, (field, name) => {
      this.buffer.addUniform(field.name, field.size);
    });

    this.buffer.create();
    this.update(proto);

    return this;
  }

  update(vals: V): void;
  update(vals: { [name: string]: number | Bufferable }): void;
  update(vals: object): void {
    const fields_by_name = _.fromPairs(
      _.map(this.meta.fields, (f) => [f.name, f]),
    );

    const data = this.buffer.getData();

    _.each(vals, (val, name) => {
      const field = fields_by_name[name];
      if (!field) {
        return;
      }

      if (typeof val == "number") {
        this.buffer.updateUniform(field.name, [val], field.size);
      } else {
        // @ts-expect-error
        this.buffer.updateUniform(field.name, val.asArray(), field.size);
      }
    });

    this.buffer.update();
  }
}

// TODO Could also infer buffer meta layout from type info and verify here.
export function create_compute_shader(
  engine: BABYLON.Engine,
  name: string,
  source: string,
  opts: Partial<BABYLON.IComputeShaderOptions> = {},
) {
  console.log("create_compute_shader", source);
  const reflect = new WgslReflect(source);
  console.log("create_compute_shader", reflect);
  opts = _.merge(opts, {
    bindingsMapping: _.fromPairs(
      _.map(_.concat(reflect.uniforms, reflect.storage), (entry) => [
        entry.name,
        { group: entry.group, binding: entry.binding },
      ]),
    ),
  });

  return new BABYLON.ComputeShader(
    name,
    engine,
    { computeSource: source },
    opts,
  );
}
