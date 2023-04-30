// @ref https://www.vorillaz.com/dadras-attractor/
vec3 dp_dt(vec3 p) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  // float a = getRandomArbitrary(2, 3);
  // float b = getRandomArbitrary(1.9, 2.7);
  // float c = getRandomArbitrary(1.3, 1.7);
  // float d = getRandomArbitrary(1.2, 2);
  // float e = getRandomArbitrary(7, 9);

  float a = 2.5;
  float b = 2.3;
  float c = 1.5;
  float d = 1.8;
  float e = 8.0;

  float dx = y - a * x + b * y * z;
  float dy = c * y - x * z + z;
  float dz = d * x * y - e * z;

  return vec3(dx, dy, dz);
}