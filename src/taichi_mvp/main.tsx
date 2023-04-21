import * as ti from "taichi.js";

const vec3 = ti.types.vector(ti.f32, 3);

let main = async () => {
  await ti.init();
  let n = 320;
  let pixels = ti.Vector.field(4, ti.f32, [2 * n, n]);

  let complex_sqr = (z: number[]) => {
    return [z[0] ** 2 - z[1] ** 2, z[1] * z[0] * 2];
  };

  ti.addToKernelScope({ pixels, n, complex_sqr });

  let kernel = ti.kernel((t: number) => {
    // @ts-expect-error
    for (let I of ndrange(n * 2, n)) {
      const i = I[0];
      const j = I[1];
      let c = [-0.8, Math.cos(t) * 0.2];
      // @ts-expect-error
      let z = [i / n - 1, j / n - 0.5] * 2;
      var iterations = 0;

      // @ts-expect-error
      while (z.norm() < 20 && iterations < 50) {
        // @ts-expect-error
        z = complex_sqr(z) + c;
        iterations = iterations + 1;
      }
      // @ts-expect-error
      pixels[[i, j]] = 1 - iterations * 0.02;
      // @ts-expect-error
      pixels[[i, j]][3] = 1;
    }
  });

  let htmlCanvas = document.getElementById(
    "result_canvas",
  ) as HTMLCanvasElement;

  htmlCanvas.width = 2 * n;
  htmlCanvas.height = n;

  let canvas = new ti.Canvas(htmlCanvas);

  let i = 0;
  async function frame() {
    kernel(i * 0.02);
    i = i + 1;
    canvas.setImage(pixels);
    requestAnimationFrame(frame);
  }
  await frame();
};

main();
