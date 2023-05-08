import { assert, expect, test } from "vitest";

import * as BABYLON from "@babylonjs/core";

import {
  Vector2,
  Vector3,
  Color3,
  Vector4,
  Color4,
  Matrix,
} from "@babylonjs/core";

import { value_size, struct_meta } from "./compute_util";

test("value_size", () => {
  expect(value_size(1.0)).toBe(1);

  expect(value_size(new Vector2())).toBe(2);
  expect(value_size(new Vector3())).toBe(3);
  expect(value_size(new Vector3())).toBe(3);
  expect(value_size(new Vector4())).toBe(4);
  expect(value_size(new Color4())).toBe(4);
  // Matrix doesn't currently have a fromArray
  // expect(value_size(new Matrix())).toBe(16);

  expect(() => {
    // @ts-expect-error
    value_size("foo");
  }).toThrow();
});

test("struct_meta", () => {
  const proto = {
    pos: new Vector4(),
    vel: new Vector4(),
    col: new Vector4(),
    lifetime: 0.0,
    pad: 0.0,
  };

  const meta = [
    {
      name: "pos",
      size: 4,
      offset: 0,
    },
    {
      name: "vel",
      size: 4,
      offset: 4,
    },
    {
      name: "col",
      size: 4,
      offset: 8,
    },
    {
      name: "lifetime",
      size: 1,
      offset: 12,
    },
    {
      name: "pad",
      size: 1,
      offset: 13,
    },
  ];

  expect(struct_meta(proto)).toStrictEqual(meta);
});
