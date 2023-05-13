precision highp float;
precision highp int;

layout(location = 0) out vec4 out_loc;
layout(location = 1) out vec4 out_vel;
layout(location = 2) out vec4 out_color;
layout(location = 3) out vec4 out_target;

uniform sampler2D p_target;
uniform sampler2D p_hsv_color;

uniform vec2 resolution;

#include "../lygia/math/const.glsl"
#include "../lygia/generative/random.glsl"
#include "../lygia/generative/curl.glsl"
#include "../lygia/color/space/hsv2rgb.glsl"

/**
 * Generate a uniformly distributed random point on the unit-sphere.
 * 
 * After:
 * http://mathworld.wolfram.com/SpherePointPicking.html
 */
vec3 random_sphere_point(vec2 rand) {
  float ang1 = (rand.x + 1.0) * PI; // [-1..1) -> [0..2*PI)
  float u = rand.y; // [-1..1), cos and acos(2v-1) cancel each other out, so we arrive at [-1..1)
  float u2 = u * u;
  float sqrt1MinusU2 = sqrt(1.0 - u2);
  float x = sqrt1MinusU2 * cos(ang1);
  float y = sqrt1MinusU2 * sin(ang1);
  float z = u;
  return vec3(x, y, z);
}

uniform vec3 init_center;
uniform float init_radius;

void init_point() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 loc = vec4(normalize(random_sphere_point(2.0 * random2(uv) - vec2(1.0))) * init_radius + init_center, 0.0);
    vec4 vel = vec4(0.0);

    vec4 target;
    target = texture(p_target, uv);

    vec4 hsv_color = texture(p_hsv_color, uv);
    vec4 color = vec4(hsv2rgb(hsv_color.xyz), 1.0);
    out_loc = loc;
    out_vel = vel;
    out_color = color;
    out_target = target;
}