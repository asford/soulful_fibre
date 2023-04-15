#ifndef resolution
vec2 resolution = vec2(0, 0);
#endif

uniform float step_size;
uniform float range;

// TODO this should resample from input textures if invalid?
// Simple boundary conditions, re-emerge on unit cube.
highp vec3 bound_check(in vec3 p) {

    if(any(lessThan(x, range)) || any(greaterThan(x, range))) {
        p /= range;
    }

    return p;
}

// thomas attractor
highp vec3 dp_dt(in vec3 p, inout vec3 into) {
    float x = p.x;
    float y = p.y;
    float z = p.z;

    float b = 0.19;
    // Inserted scaling factor C for tuning.
    float c = 10;

    float dx = c * (-b * x + sin(y));
    float dy = c * (-b * y + sin(z));
    float dz = c * (-b * z + sin(x));

    into.x = dx;
    into.y = dy;
    into.z = dz;

    return into;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    tex vec4 position = texture2D(texture_position, uv);
    vec3 delta;
    dp_dt(position.xyz, delta);
    position += dp_dt * step_size;
    position = bound_check(position);

    gl_FragColor = vec4(position, length(delta));
}