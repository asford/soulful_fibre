layout(location = 0) out vec4 out_loc;
layout(location = 1) out vec4 out_vel;
layout(location = 2) out vec4 out_color;

uniform sampler2D back_loc;
uniform sampler2D back_vel;
uniform sampler2D back_color;

uniform vec2 resolution;
uniform float delta;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 loc = texture(back_loc, uv);
    vec4 color = texture(back_color, uv);

    vec4 vel = vec4(dp_dt(loc.xyz), 0.0);

    out_vel = vel;
    out_loc = loc + (vel * delta);
    out_color = color;
}