precision highp float;
precision highp int;

layout(location = 0) out vec4 out_loc;
layout(location = 1) out vec4 out_vel;
layout(location = 2) out vec4 out_color;

uniform sampler2D back_loc;
uniform sampler2D back_vel;
uniform sampler2D back_color;

uniform vec2 resolution;
uniform float delta;
uniform float force;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float delta = .001;

    vec4 loc = texture(back_loc, uv);
    vec4 vel = texture(back_vel, uv);
    vec4 color = texture(back_color, uv);

    vec4 origin = vec4(0.0);
    vec4 displacement = (origin - loc) * force;
    vec4 accel = displacement;

    out_vel = vel + (accel * delta);
    out_loc = loc + (vel * delta);
    out_color = color;
}