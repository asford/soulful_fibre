// @ref https://www.vorillaz.com/thomas-attractor/
vec3 dp_dt(vec3 p) {
    float x = p.x;
    float y = p.y;
    float z = p.z;

    float c = 10.0;
    float b = 0.19;

    float dx = c * (-b * x + sin(y));
    float dy = c * (-b * y + sin(z));
    float dz = c * (-b * z + sin(x));

    return vec3(dx, dy, dz);
}