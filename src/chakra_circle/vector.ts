import _ from "underscore";
import { ScaleContinuousNumeric, scaleLinear } from "d3";
import { Vector } from "p5";

export function v(x?: number, y?: number, z?: number): Vector {
    return new Vector(x, y, z);
}

export interface VecIsh {
    x: number;
    y: number;
    z?: number;
}

export class VecScale {
    constructor(
        public x: ScaleContinuousNumeric<number, number>,
        public y: ScaleContinuousNumeric<number, number>,
        public z?: ScaleContinuousNumeric<number, number>,
    ) {}

    static linear(): VecScale {
        return new VecScale(scaleLinear(), scaleLinear());
    }

    domain(vals: VecIsh[]): this {
        this.x.domain(
            _.map(vals, function (v) {
                return v.x;
            }),
        );
        this.y.domain(
            _.map(vals, function (v) {
                return v.y;
            }),
        );
        this.z?.domain(
            _.map(vals, function (v) {
                return v.z ?? NaN;
            }),
        );

        return this;
    }

    range(vals: VecIsh[]): this {
        this.x.range(
            _.map(vals, function (v) {
                return v.x;
            }),
        );
        this.y.range(
            _.map(vals, function (v) {
                return v.y;
            }),
        );
        this.z?.range(
            _.map(vals, function (v) {
                return v.z ?? NaN;
            }),
        );

        return this;
    }

    bind() {
        return (value: VecIsh) => {
            return v(
                this.x(value.x),
                this.y(value.y),
                this?.z?.(value.z ?? NaN) ?? NaN,
            );
        };
    }
}
