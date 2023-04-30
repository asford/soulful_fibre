uniform float time;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

#include "../lygia/generative/fbm.glsl"

void main() {
    vec4 color = vec4(vec3(0.0), 1.0);
    vec2 pixel = 1.0/uResolution.xy;
    vec2 st = gl_FragCoord.xy * pixel;
    float d3 = fbm(vec3(st * 5.0, uTime)) * 0.5 + 0.5;

    color += vec4(vec3(d3), st.x);

    gl_FragColor.rgba = color;
}