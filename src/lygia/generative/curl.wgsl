#include "snoise.wgsl"

// appears broken, collapses into single points.
fn curl22(p: vec2f) -> vec2f {
    const e: f32 = .1;

    var dx = vec2f(e, 0.0);
    var dy = vec2f(0.0, e);

    var p_x0 = snoise22(p - dx);
    var p_x1 = snoise22(p + dx);
    var p_y0 = snoise22(p - dy);
    var p_y1 = snoise22(p + dy);

    var x = p_x1.y + p_x0.y;
    var y = p_y1.x - p_y0.x;

    const divisor = 1.0 / (2.0 * e);
    return normalize(vec2f(x, y) * divisor);
}

fn curl33(p: vec3f) -> vec3f {
    const e: f32 = .1;
    let dx = vec3f(e, 0.0, 0.0);
    let dy = vec3f(0.0, e, 0.0);
    let dz = vec3f(0.0, 0.0, e);

    let p_x0 = snoise33(p - dx);
    let p_x1 = snoise33(p + dx);
    let p_y0 = snoise33(p - dy);
    let p_y1 = snoise33(p + dy);
    let p_z0 = snoise33(p - dz);
    let p_z1 = snoise33(p + dz);

    let x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
    let y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
    let z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

    const divisor = 1.0 / (2.0 * e);
    return normalize(vec3f(x, y, z) * divisor);
}

fn curl34(p: vec4f) -> vec3f {
    const e: f32 = .1;
    let dx = vec4f(e, 0.0, 0.0, 1.0);
    let dy = vec4f(0.0, e, 0.0, 1.0);
    let dz = vec4f(0.0, 0.0, e, 1.0);

    let p_x0 = snoise34(p - dx);
    let p_x1 = snoise34(p + dx);
    let p_y0 = snoise34(p - dy);
    let p_y1 = snoise34(p + dy);
    let p_z0 = snoise34(p - dz);
    let p_z1 = snoise34(p + dz);

    let x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
    let y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
    let z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

    const divisor = 1.0 / (2.0 * e);
    return normalize(vec3f(x, y, z) * divisor);
}