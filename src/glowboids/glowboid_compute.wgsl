struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  color : vec4<f32>,
  scale: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

struct ParticleParams {
  attractor: vec2<f32>,
};

struct Params {
  delta_t : f32,
  cohesion_dist : f32,
  separation_dist : f32,
  alignment_dist : f32,
  cohesion_scale : f32,
  separation_scale : f32,
  alignment_scale : f32,

  attract_dist: f32,
  attract_scale: f32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> particles : array<Particle>;
@binding(2) @group(0) var<storage, read_write> particle_params: array<ParticleParams>;

fn boid_force(index: u32, p: Particle, p_param: ParticleParams) -> vec2<f32> {
  var num_particles : u32 = arrayLength(&particles);

  var pos = p.pos;

  var cMass : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var colVel : vec2<f32> = vec2<f32>(0.0, 0.0);
  var cMassCount : u32 = 0u;
  var cVelCount : u32 = 0u;

  for (var i : u32 = 0u; i < num_particles; i = i + 1u) {
    if (i == index) {
      continue;
    }

    var other_pos = particles[i].pos.xy;
    var other_vel = particles[i].vel.xy;
    if (distance(other_pos, pos) < params.cohesion_dist) {
      cMass = cMass + other_pos;
      cMassCount = cMassCount + 1u;
    }
    if (distance(other_pos, pos) < params.separation_dist) {
      colVel = colVel - (other_pos - pos);
    }
    if (distance(other_pos, pos) < params.alignment_dist) {
      cVel = cVel + other_vel;
      cVelCount = cVelCount + 1u;
    }
  }
  if (cMassCount > 0u) {
    var temp : f32 = f32(cMassCount);
    cMass = (cMass / vec2<f32>(temp, temp)) - pos;
  }
  if (cVelCount > 0u) {
    var temp : f32 = f32(cVelCount);
    cVel = cVel / vec2<f32>(temp, temp);
  }

  return (cMass * params.cohesion_scale) + (colVel * params.separation_scale) + (cVel * params.alignment_scale);
}

fn attract_force(index: u32, p: Particle, p_param: ParticleParams) -> vec2<f32> {
  var pos = p.pos;
  var attractor = p_param.attractor;
  return (attractor - pos) * params.attract_scale * 5e-2;
}

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var index : u32 = GlobalInvocationID.x;
  var num_particles : u32 = arrayLength(&particles);

  if (index >= num_particles) {
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

  // Wrap around boundary
  if (pos.x < -1.0) {
    pos.x = 1.0;
  }
  if (pos.x > 1.0) {
    pos.x = -1.0;
  }
  if (pos.y < -1.0) {
    pos.y = 1.0;
  }
  if (pos.y > 1.0) {
    pos.y = -1.0;
  }

  // Write back
  particles[index].pos = pos;
  particles[index].vel = vel;
}