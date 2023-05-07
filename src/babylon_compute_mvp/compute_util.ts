import * as BABYLON from "@babylonjs/core";
import * as _ from "lodash";
import ndarray from "ndarray";

const types_by_size = {
  2: [BABYLON.Vector2],
  3: [BABYLON.Vector3, BABYLON.Color3],
  4: [BABYLON.Vector4, BABYLON.Color4, BABYLON.Quaternion],
  16: [BABYLON.Matrix],
};

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

export function value_size(value: any): number {
  if (typeof value === "number") {
    return 1;
  } else if (is_any(value, types_by_size[2])) {
    return 2;
  } else if (is_any(value, types_by_size[3])) {
    return 3;
  } else if (is_any(value, types_by_size[4])) {
    return 4;
  } else if (is_any(value, types_by_size[16])) {
    return 16;
  }

  throw Error(`Unsupported value: ${value}`, value);
}

export interface FieldMeta {
  name: string;
  size: number;
  offset: number;
}

export function struct_meta<V extends object>(proto: V): FieldMeta[] {
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

class RecordMeta<V extends object> {
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
}

export class StorageAdapter<V extends object> {
  meta: RecordMeta<V>;

  size: number;

  source_buffer: Float32Array;
  field_views: { [K in keyof V]: ndarray.NdArray };

  storage_buffer: BABYLON.StorageBuffer;
  vertex_buffers: BABYLON.VertexBuffer[];

  set(idx: number, val: V) {
    _.each(this.meta.fields, (field) => {
      const loc = idx * this.meta.record_size + field.offset;
      if (field.size == 1) {
        // @ts-expect-error
        this.source_buffer[loc] = val[field.name];
      } else {
        // @ts-expect-error
        val[field.name].toArray(this.source_buffer, loc);
      }
    });
  }

  get(idx: number, into?: V): V {
    if (!into) {
      into = _.cloneDeep(this.meta.proto);
    }

    _.each(this.meta.fields, (field) => {
      const loc = idx * this.meta.record_size + field.offset;
      if (field.size == 1) {
        // @ts-expect-error
        into[field.name] = this.source_buffer[loc];
      } else {
        // @ts-expect-error
        into[field.name].fromArray(this.source_buffer, loc);
      }
    });

    return into;
  }

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

    // @ts-expect-error
    this.field_views = {};
    _.each(this.meta.fields, (field) => {
      const view = ndarray(
        this.source_buffer,
        [this.size, field.size],
        [this.meta.record_size, 1],
        field.offset,
      );

      // @ts-expect-error
      this.field_views[field.name] = view;
    });

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
}

export class UniformAdapter<V extends object> {
  meta: RecordMeta<V>;
  buffer: BABYLON.UniformBuffer;

  constructor(proto: V, engine: BABYLON.Engine, name: string) {
    this.meta = new RecordMeta(proto);

    this.buffer = new BABYLON.UniformBuffer(engine, undefined, undefined, name);

    _.each(this.meta.fields, (field, name) => {
      this.buffer.addUniform(field.name, field.size);
    });

    this.buffer.create();

    return this;
  }

  update(vals: V): void;
  update(vals: { [name: string]: number }): void;
  update(vals: object): void {
    const fields_by_name = _.fromPairs(
      _.map(this.meta.fields, (f) => [f.name, f]),
    );
    _.each(vals, (val, name) => {
      const field = fields_by_name[name];
      if (!field) {
        return;
      }

      if (field.size != 1) {
        throw Error("Can only update float uniforms.");
      }

      this.buffer.updateFloat(name, val);
    });

    this.buffer.update();
  }
}
