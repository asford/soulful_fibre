export interface Attractor {
  // Calculate dPdT in-place and return dPdT
  // Note, attractor interface should be refactored to:
  // - Expose attractor parameters as configurable objects.
  // - Add a scaling factor to the attractor.
  (p: THREE.Vector3, dp_dt: THREE.Vector3): THREE.Vector3;
}

// Chen-Lee Attractor
// @ref https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2
// @ref https://www.vorillaz.com/chen-lee-attractor/
export function chen_lee(p: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  const alpha = 5.0;
  const beta = -10.0;
  const gamma = -0.38;

  const dx = alpha * x - y * z;
  const dy = beta * y + x * z;
  const dz = gamma * z + (x * y) / 3.0;

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}

// @ref https://www.vorillaz.com/halvorsen-attractor/
export function halvorsen(
  p: THREE.Vector3,
  into: THREE.Vector3,
): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  const a = 1.4;

  const dx = -a * x - 4 * y - 4 * z - y * y;
  const dy = -a * y - 4 * z - 4 * x - z * z;
  const dz = -a * z - 4 * x - 4 * y - x * x;

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}

// @ref https://www.vorillaz.com/thomas-attractor/
export function thomas(p: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  const b = 0.19;
  // Inserted scaling factor C for tuning.
  const c = 10;

  const dx = c * (-b * x + Math.sin(y));
  const dy = c * (-b * y + Math.sin(z));
  const dz = c * (-b * z + Math.sin(x));

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}

// @ref https://www.vorillaz.com/dequan-li-attractor/
// Yikes, unstable!
export function dequan_li(
  p: THREE.Vector3,
  into: THREE.Vector3,
): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  const a = 40.0;
  const b = 1.833;
  const c = 0.16;
  const d = 0.65;
  const e = 55.0;
  const f = 20.0;

  const dx = a * (y - x) + c * x * z;
  const dy = e * x + f * y - x * z;
  const dz = b * z + x * y - d * x * x;

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}

// @ref https://www.vorillaz.com/arneodo-attractor/
// Yikes, unstable!
export function arneodo(p: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  const a = 5.5;
  const b = 3.5;
  const c = 0.01;

  const dx = y;
  const dy = z;
  const dz = a * x - b * y - z - c * Math.pow(x, 3);

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}

// @ref https://www.vorillaz.com/dadras-attractor/
export function dadras(p: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;

  // const a = getRandomArbitrary(2, 3);
  // const b = getRandomArbitrary(1.9, 2.7);
  // const c = getRandomArbitrary(1.3, 1.7);
  // const d = getRandomArbitrary(1.2, 2);
  // const e = getRandomArbitrary(7, 9);

  const a = 2.5;
  const b = 2.3;
  const c = 1.5;
  const d = 1.8;
  const e = 8;

  const dx = y - a * x + b * y * z;
  const dy = c * y - x * z + z;
  const dz = d * x * y - e * z;

  into.x = dx;
  into.y = dy;
  into.z = dz;

  return into;
}
