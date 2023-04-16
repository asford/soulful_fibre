import p5 from "p5";

const sketch = (p: p5) => {
  var x = 100;
  var y = 100;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    p.background(0);
    p.fill(255);
    p.rect(x, y, 50, 50);
  };
};

export function smoketest() {
  return new p5(sketch);
}