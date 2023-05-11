
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  color: vec4<f32>,
  size: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

struct ParticleParams {
  color: vec4<f32>,
  attractor: vec2<f32>,
  size: f32,
  pad1: f32,
};

struct Params {
  delta_t: f32,

  attract_force: f32,
  curl_force: f32,
  curl_scale: f32,

  size_factor: f32,
  color_factor: f32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> particles : array<Particle>;
@binding(2) @group(0) var<storage, read_write> particle_params: array<ParticleParams>;

fn wrap(v: f32, min: f32, max: f32) -> f32 {
    if v < min {
        return max;
    } else if v > max {
        return min;
    } else {
        return v;
    }
}

fn wrap_box(scale: f32, pt: vec2<f32>) -> vec2<f32> {
    var result = pt;
    result.x = wrap(pt.x, -scale, scale);
    result.y = wrap(pt.y, -scale, scale);
    return result;
}

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    var index: u32 = GlobalInvocationID.x;
    var num_particles: u32 = arrayLength(&particles);

    if index >= num_particles {
        return;
    }

    var p = particles[index];
    var p_params = particle_params[index];

    var pos = p.pos;
    var attractor = p_params.attractor;
    var delta_force = attractor - pos;

    // There appears to be a bug with curl force which is driving collapse to single points
    var curl_force = curl22(pos / params.curl_scale);

    var vel = params.attract_force * delta_force + params.curl_force * curl_force;

    // kinematic update
    pos = pos + (vel * params.delta_t);
    pos = wrap_box(1.0, pos);

    // Write back
    particles[index].pos = pos;
    particles[index].vel = vel;
    particles[index].size = p_params.size * params.size_factor;
    particles[index].color = p_params.color * params.color_factor;
}

#include "../lygia/generative/curl.wgsl"