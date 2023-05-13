#include "./compute.glsl"

uniform sampler2D back_loc;
uniform sampler2D back_vel;
uniform sampler2D back_color;
uniform sampler2D back_target;

uniform float delta;
uniform float f_disp;
uniform float f_curl;
uniform float curl_scale;
uniform float curl_p;


// Should perturb curl_p by uv-dependent term for semi-noise?

void step_point() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 loc = texture(back_loc, uv);
    vec4 hsv_color = texture(p_hsv_color, uv);
    vec4 target = texture(p_target, uv);
    
    vec4 color = vec4(hsv2rgb(hsv_color.xyz), 1.0);

    vec4 deviation_force = (target - loc);
    // Step down curl_p for less sensitive changes in curl field.
    vec4 curl_force = vec4(curl(vec4(loc.xyz, curl_p / 10.0) / curl_scale), 0.0);

    vec4 vel = (deviation_force * f_disp + curl_force * f_curl);

    out_vel = vel;
    out_loc = loc + (vel * delta);
    out_color = color;
    out_target = target;
}

void main() {
    step_point();
}