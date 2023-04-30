// Chen-Lee Attractor
// @ref https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2
// @ref https://www.vorillaz.com/chen-lee-attractor/
vec3 dp_dt(vec3 p) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  float alpha = 5.0;
  float beta = -10.0;
  float gamma = -0.38;

  float dx = alpha * x - y * z;
  float dy = beta * y + x * z;
  float dz = gamma * z + (x * y) / 3.0;

  return vec3(dx, dy, dz);
}