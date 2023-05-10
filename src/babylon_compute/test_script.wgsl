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
  attract_scale: f32,
  size_factor: f32,
  color_factor: f32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> particles : array<Particle>;
@binding(2) @group(0) var<storage, read_write> particle_params: array<ParticleParams>;

fn attract_force(index: u32, p: Particle, p_param: ParticleParams) -> vec2<f32> {
    var pos = p.pos;
    var attractor = p_param.attractor;
    return normalize(attractor - pos) * params.attract_scale * 5e-2;
}

struct AABB2 {
  min: vec2<f32>,
  max: vec2<f32>,
}

fn wrap(v: f32, min: f32, max: f32) -> f32 {
    if v < min {
        return max;
    } else if v > max {
        return min;
    } else {
        return v;
    }
}

fn wrap_aabb(aabb: AABB2, pt: vec2<f32>) -> vec2<f32> {
    pt.x = wrap(pt.x, aabb.min.x, aabb.max.x);
    pt.y = wrap(pt.y, aabb.min.y, aabb.max.y);
    return pt;
}

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    var index: u32 = GlobalInvocationID.x;
    var t: u32 = 10u;
    var num_particles: u32 = arrayLength(&particles);

    if index >= t {
        return;
    }

    var p = particles[index];
    var p_params = particle_params[index];
    var accl = attract_force(index, p, p_params);

    var pos = p.pos;
    var vel = p.vel;

    vel = accl * params.delta_t;

    // clamp velocity for a more pleasing simulation
    // vel = normalize(vel) * clamp(length(vel), 0.0, 0.1);

    // kinematic update
    pos = pos + (vel * params.delta_t);

    var unit_box = AABB2(vec2(-1., -1.), vec2(1., 1.));
    pos = wrap_aabb(unit_box, pos);

    // Write back
    particles[index].pos = pos;
    particles[index].vel = vel;
    particles[index].size = p_params.size * params.size_factor;
    particles[index].color = p_params.color * params.color_factor;
}