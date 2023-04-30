import { render } from "react-dom";
import {
  Camera,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearSRGBColorSpace,
  MagnificationTextureFilter,
  Mesh,
  MinificationTextureFilter,
  NearestFilter,
  NoToneMapping,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  RawShaderMaterial,
  Texture,
  TextureFilter,
  WebGLRenderTarget,
  WebGLMultipleRenderTargets,
  WebGLRenderer,
  Wrapping,
  Material,
  Vector2,
  IUniform,
  GLSL3,
  ShaderMaterial,
} from "three";
import _ from "underscore";

const PASS_THROUGH_VERTEX: string = `
  in vec3 position;
  void main() {
    gl_Position = vec4( position, 1.0 );
  }
`;

class MRTComputationRenderer {
  public scene: Scene;

  public sizeX: number;
  public sizeY: number;
  public renderer: WebGLRenderer;

  public mesh: Mesh;
  public camera: Camera;

  public dataType: THREE.TextureDataType;

  constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    this.dataType = FloatType;

    this.scene = new Scene();

    // Not clear, this appears to fire up a standard orthographic camera.
    // @ts-expect-error
    this.camera = new Camera();
    this.camera.position.z = 1;

    this.mesh = new Mesh(new PlaneGeometry(2, 2));
    this.scene.add(this.mesh);
  }

  doRenderTarget(material: ShaderMaterial, output: WebGLMultipleRenderTargets) {
    const prevXrEnabled = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false; // Avoid camera modification
    const prevShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
    // @ts-expect-error
    const prevOutputColorSpace = this.renderer.outputColorSpace;
    // @ts-expect-error
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    const prevToneMapping = this.renderer.toneMapping;
    this.renderer.toneMapping = NoToneMapping;

    const prevRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(output);

    const prevMaterial = this.mesh.material;
    this.mesh.material = material;

    this.renderer.render(this.scene, this.camera);

    this.mesh.material = prevMaterial;

    this.renderer.setRenderTarget(prevRenderTarget);

    this.renderer.xr.enabled = prevXrEnabled;
    this.renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
    // @ts-expect-error
    this.renderer.outputColorSpace = prevOutputColorSpace;
    this.renderer.toneMapping = prevToneMapping;
  }

  create_texture(data?: Float32Array) {
    if (!data) {
      data = new Float32Array(this.sizeX * this.sizeY * 4);
    }

    if (data.length != this.sizeX * this.sizeY * 4) {
      throw new Error("Invalid initial data size.");
    }

    const texture = new DataTexture(
      data,
      this.sizeX,
      this.sizeY,
      RGBAFormat,
      FloatType,
    );
    texture.needsUpdate = true;
    return texture;
  }
}

class MRTRenderCycle<InitUT, ComputeUT> {
  public back: WebGLMultipleRenderTargets;
  public front: WebGLMultipleRenderTargets;

  public init_material: ShaderMaterial;
  public compute_material: ShaderMaterial;

  constructor(
    public renderer: MRTComputationRenderer,
    public names: string[],
    public init_shader: string,
    public init_uniforms: InitUT,
    public compute_shader: string,
    public compute_uniforms: ComputeUT,
  ) {
    this.back = this.createMRT();
    this.front = this.createMRT();

    this.init_material = this.createShaderMaterial(this.init_shader, {
      ...this.init_uniforms,
      ...this.standard_uniforms(),
    });

    this.compute_material = this.createShaderMaterial(this.compute_shader, {
      ...this.compute_uniforms,
      ...this.standard_uniforms(),
      ...this.back_texture_uniforms(),
    });

    this.init();
  }

  init() {
    this.renderer.doRenderTarget(this.init_material, this.back);
    this.renderer.doRenderTarget(this.init_material, this.front);
  }
  swap() {
    const prev_back = this.back;
    const prev_front = this.front;

    this.back = prev_front;
    this.front = prev_back;

    _.each(
      {
        ...this.compute_uniforms,
        ...this.standard_uniforms(),
        ...this.back_texture_uniforms(),
      },
      (incoming, name) => {
        this.compute_material.uniforms[name].value = incoming.value;
      },
    );
  }

  render() {
    this.swap();

    this.renderer.doRenderTarget(this.compute_material, this.front);
  }

  standard_uniforms(): { [uniform: string]: IUniform } {
    return {
      resolution: {
        value: new Vector2(this.renderer.sizeX, this.renderer.sizeY),
      },
    };
  }

  back_texture_uniforms(): {
    [uniform: string]: IUniform;
  } {
    const result: {
      [uniform: string]: IUniform;
    } = {};

    _.each(this.back.texture, (texture: Texture) => {
      result[`back_${texture.name}`] = { value: texture };
    });

    return result;
  }

  texture_uniforms(): {
    [uniform: string]: IUniform;
  } {
    const result: {
      [uniform: string]: IUniform;
    } = {};

    _.each(this.front.texture, (texture: Texture) => {
      result[`${texture.name}`] = { value: texture };
    });

    return result;
  }

  createShaderMaterial(
    fragmentShader: string,
    uniforms: { [uniform: string]: IUniform },
  ) {
    const material = new RawShaderMaterial({
      uniforms: uniforms,
      vertexShader: PASS_THROUGH_VERTEX,
      fragmentShader: fragmentShader,
      glslVersion: GLSL3,
    });

    return material;
  }

  createMRT() {
    const renderTarget = new WebGLMultipleRenderTargets(
      this.renderer.sizeX,
      this.renderer.sizeY,
      this.names.length,
      {
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        format: RGBAFormat,
        type: this.renderer.dataType,
        depthBuffer: false,
      },
    );

    _.each(this.names, (name, index) => {
      renderTarget.texture[index].name = name;
    });

    return renderTarget;
  }
}

export { MRTComputationRenderer, MRTRenderCycle };
