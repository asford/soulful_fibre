precision highp float;
precision highp int;

uniform vec2 resolution;

layout(location = 0) out vec4 out_loc;
layout(location = 1) out vec4 out_vel;
layout(location = 2) out vec4 out_color;

uniform sampler2D init_loc;
uniform sampler2D init_color;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 loc = texture(init_loc, uv);
    vec4 vel = vec4(-.1, .1, 0.0, 0.0);
    vec4 color = texture(init_color, uv);

    out_loc = loc;
    out_vel = vel;
    out_color = color;
}