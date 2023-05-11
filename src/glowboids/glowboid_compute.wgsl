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
  cohesion_dist: f32,
  separation_dist: f32,
  alignment_dist: f32,
  cohesion_scale: f32,
  separation_scale: f32,
  alignment_scale: f32,
  attract_dist: f32,
  attract_scale: f32,

  size_factor: f32,
  color_factor: f32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> particles : array<Particle>;
@binding(2) @group(0) var<storage, read_write> particle_params: array<ParticleParams>;

fn boid_force(index: u32, p: Particle, p_param: ParticleParams) -> vec2<f32> {
    var num_particles: u32 = arrayLength(&particles);

    var pos = p.pos;

    var cMass: vec2<f32> = vec2<f32>(0.0, 0.0);
    var cVel: vec2<f32> = vec2<f32>(0.0, 0.0);
    var sep_force: vec2<f32> = vec2<f32>(0.0, 0.0);
    var cMassCount: u32 = 0u;
    var cVelCount: u32 = 0u;

    for (var i: u32 = 0u; i < num_particles; i = i + 1u) {
        if i == index {
      continue;
        }

        var other_pos = particles[i].pos.xy;
        var other_vel = particles[i].vel.xy;
        var dist = distance(other_pos, pos);
        if dist < params.cohesion_dist {
            cMass = cMass + other_pos;
            cMassCount = cMassCount + 1u;
        }
        if dist < params.separation_dist {
            var opposing = normalize(pos - other_pos);
            // Maybe want some very-close-force to force repulsion between
            // highly adjacent points. See point-collapse between very close points.
            // if dist > params.separation_dist / 1000. {
            //     opposing = opposing * dist;
            // } else {
            //     opposing = opposing * pow(params.separation_dist, -2.0);
            // }
            // opposing = opposing * dist;
            sep_force = sep_force + opposing * (.5 + dist / params.separation_dist) * .01;
        }
        if dist < params.alignment_dist {
            cVel = cVel + other_vel;
            cVelCount = cVelCount + 1u;
        }
    }
    if cMassCount > 0u {
        var temp: f32 = f32(cMassCount);
        cMass = (cMass / vec2<f32>(temp, temp)) - pos;
    }
    if cVelCount > 0u {
        var temp: f32 = f32(cVelCount);
        cVel = cVel / vec2<f32>(temp, temp);
    }

    return (cMass * params.cohesion_scale) + (sep_force * params.separation_scale) + (cVel * params.alignment_scale);
}

fn attract_force(index: u32, p: Particle, p_param: ParticleParams) -> vec2<f32> {
    var pos = p.pos;
    var attractor = p_param.attractor;
    return (attractor - pos) * params.attract_scale * 5e-2;
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
    var accl = boid_force(index, p, p_params) + attract_force(index, p, p_params);

    var pos = p.pos;
    var vel = p.vel;

    vel = vel + (accl * params.delta_t);

  // clamp velocity for a more pleasing simulation
    vel = normalize(vel) * clamp(length(vel), 0.0, 0.1);

  // kinematic update
    pos = pos + (vel * params.delta_t);
    pos = wrap_box(1.0, pos);

  // Write back
    particles[index].pos = pos;
    particles[index].vel = vel;
    particles[index].size = p_params.size * params.size_factor;
    particles[index].color = p_params.color * params.color_factor;
}