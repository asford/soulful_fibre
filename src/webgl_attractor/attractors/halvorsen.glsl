// @ref https://www.vorillaz.com/halvorsen-attractor/
vec3 dp_dt(
  vec3 p
){
  float x = p.x;
  float y = p.y;
  float z = p.z;

  float a = 1.4;

  float dx = -a * x - 4.0 * y - 4.0 * z - y * y;
  float dy = -a * y - 4.0 * z - 4.0 * x - z * z;
  float dz = -a * z - 4.0 * x - 4.0 * y - x * x;

  return vec3(dx, dy, dz);
}