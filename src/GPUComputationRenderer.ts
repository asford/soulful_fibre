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
  ShaderMaterial,
  Texture,
  TextureFilter,
  WebGLRenderTarget,
  WebGLRenderer,
  Wrapping,
  Material,
} from "three";

/**
 * GPUComputationRenderer, based on SimulationRenderer by zz85
 *
 * The GPUComputationRenderer uses the concept of variables. These variables are RGBA float textures that hold 4 floats
 * for each compute element (texel)
 *
 * Each variable has a fragment shader that defines the computation made to obtain the variable in question.
 * You can use as many variables you need, and make dependencies so you can use textures of other variables in the shader
 * (the sampler uniforms are added automatically) Most of the variables will need themselves as dependency.
 *
 * The renderer has actually two render targets per variable, to make ping-pong. Textures from the current frame are used
 * as inputs to render the textures of the next frame.
 *
 * The render targets of the variables can be used as input textures for your visualization shaders.
 *
 * Variable names should be valid identifiers and should not collide with THREE GLSL used identifiers.
 * a common approach could be to use 'texture' prefixing the variable name; i.e texturePosition, textureVelocity...
 *
 * The size of the computation (sizeX * sizeY) is defined as 'resolution' automatically in the shader. For example:
 * #DEFINE resolution vec2( 1024.0, 1024.0 )
 *
 * -------------
 *
 * Basic use:
 *
 * // Initialization...
 *
 * // Create computation renderer
 * const gpuCompute = new GPUComputationRenderer( 1024, 1024, renderer );
 *
 * // Create initial state float textures
 * const pos0 = gpuCompute.createTexture();
 * const vel0 = gpuCompute.createTexture();
 * // and fill in here the texture data...
 *
 * // Add texture variables
 * const velVar = gpuCompute.addVariable( "textureVelocity", fragmentShaderVel, pos0 );
 * const posVar = gpuCompute.addVariable( "texturePosition", fragmentShaderPos, vel0 );
 *
 * // Add variable dependencies
 * gpuCompute.setVariableDependencies( velVar, [ velVar, posVar ] );
 * gpuCompute.setVariableDependencies( posVar, [ velVar, posVar ] );
 *
 * // Add custom uniforms
 * velVar.material.uniforms.time = { value: 0.0 };
 *
 * // Check for completeness
 * const error = gpuCompute.init();
 * if ( error !== null ) {
 *		console.error( error );
 * }
 *
 *
 * // In each frame...
 *
 * // Compute!
 * gpuCompute.compute();
 *
 * // Update texture uniforms in your visualization materials with the gpu renderer output
 * myMaterial.uniforms.myTexture.value = gpuCompute.getCurrentRenderTarget( posVar ).texture;
 *
 * // Do your rendering
 * renderer.render( myScene, myCamera );
 *
 * -------------
 *
 * Also, you can use utility functions to create ShaderMaterial and perform computations (rendering between textures)
 * Note that the shaders can have multiple input textures.
 *
 * const myFilter1 = gpuCompute.createShaderMaterial( myFilterFragmentShader1, { theTexture: { value: null } } );
 * const myFilter2 = gpuCompute.createShaderMaterial( myFilterFragmentShader2, { theTexture: { value: null } } );
 *
 * const inputTexture = gpuCompute.createTexture();
 *
 * // Fill in here inputTexture...
 *
 * myFilter1.uniforms.theTexture.value = inputTexture;
 *
 * const myRenderTarget = gpuCompute.createRenderTarget();
 * myFilter2.uniforms.theTexture.value = myRenderTarget.texture;
 *
 * const outputRenderTarget = gpuCompute.createRenderTarget();
 *
 * // Now use the output texture where you want:
 * myMaterial.uniforms.map.value = outputRenderTarget.texture;
 *
 * // And compute each frame, before rendering to screen:
 * gpuCompute.doRenderTarget( myFilter1, myRenderTarget );
 * gpuCompute.doRenderTarget( myFilter2, outputRenderTarget );
 *
 *
 *
 * @param {int} sizeX Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {int} sizeY Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {WebGLRenderer} renderer The renderer
 */

export interface GPUComputationRendererVariable {
  name: string;
  initialValueTexture: Texture;
  renderTargets: WebGLRenderTarget[];
  dependencies: GPUComputationRendererVariable[];
  wrapS: Wrapping;
  wrapT: Wrapping;
  minFilter: MinificationTextureFilter;
  magFilter: MagnificationTextureFilter;
  material: ShaderMaterial;
}

class GPUComputationRenderer {
  public scene: Scene;
  public currentTextureIndex: number;
  public variables: GPUComputationRendererVariable[];
  public camera: Camera;
  public sizeX: number;
  public sizeY: number;
  public renderer: WebGLRenderer;
  public passThruShader: ShaderMaterial;
  public mesh: Mesh;
  public passThruUniforms: { passThruTexture: { value: any } };
  public dataType: THREE.TextureDataType;

  constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    this.variables = [];

    this.currentTextureIndex = 0;

    this.dataType = FloatType;

    this.scene = new Scene();

    // Not clear, this appears to fire up a standard orthographic camera.
    // @ts-expect-error
    this.camera = new Camera();
    this.camera.position.z = 1;

    this.passThruUniforms = {
      passThruTexture: { value: null },
    };

    this.passThruShader = this.createShaderMaterial(
      this.getPassThroughFragmentShader(),
      this.passThruUniforms,
    );

    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.passThruShader);
    this.scene.add(this.mesh);
  }

  setDataType(type: THREE.TextureDataType) {
    this.dataType = type;
    return this;
  }

  addVariable(
    variableName: string,
    computeFragmentShader: string,
    initialValueTexture: Texture,
  ): GPUComputationRendererVariable {
    const material = this.createShaderMaterial(computeFragmentShader);

    const variable = {
      name: variableName,
      initialValueTexture: initialValueTexture,
      material: material,
      dependencies: [],
      renderTargets: [],
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    };

    this.variables.push(variable);

    return variable;
  }

  setVariableDependencies(
    variable: GPUComputationRendererVariable,
    dependencies: GPUComputationRendererVariable[],
  ) {
    variable.dependencies = dependencies;
  }

  init() {
    if (
      this.renderer.capabilities.isWebGL2 === false &&
      this.renderer.extensions.has("OES_texture_float") === false
    ) {
      return "No OES_texture_float support for float textures.";
    }

    if (this.renderer.capabilities.maxVertexTextures === 0) {
      return "No support for vertex shader textures.";
    }

    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];

      // Creates rendertargets and initialize them with input texture
      variable.renderTargets[0] = this.createRenderTarget(
        this.sizeX,
        this.sizeY,
        variable.wrapS,
        variable.wrapT,
        variable.minFilter,
        variable.magFilter,
      );
      variable.renderTargets[1] = this.createRenderTarget(
        this.sizeX,
        this.sizeY,
        variable.wrapS,
        variable.wrapT,
        variable.minFilter,
        variable.magFilter,
      );
      this.renderTexture(
        variable.initialValueTexture,
        variable.renderTargets[0],
      );
      this.renderTexture(
        variable.initialValueTexture,
        variable.renderTargets[1],
      );

      // Adds dependencies uniforms to the ShaderMaterial
      const material = variable.material;
      const uniforms = material.uniforms;

      if (variable.dependencies !== null) {
        for (let d = 0; d < variable.dependencies.length; d++) {
          const depVar = variable.dependencies[d];

          if (depVar.name !== variable.name) {
            // Checks if variable exists
            let found = false;

            for (let j = 0; j < this.variables.length; j++) {
              if (depVar.name === this.variables[j].name) {
                found = true;
                break;
              }
            }

            if (!found) {
              return (
                "Variable dependency not found. Variable=" +
                variable.name +
                ", dependency=" +
                depVar.name
              );
            }
          }

          uniforms[depVar.name] = { value: null };

          material.fragmentShader =
            "\nuniform sampler2D " +
            depVar.name +
            ";\n" +
            material.fragmentShader;
        }
      }
    }

    this.currentTextureIndex = 0;

    return null;
  }

  compute() {
    const currentTextureIndex = this.currentTextureIndex;
    const nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

    for (let i = 0, il = this.variables.length; i < il; i++) {
      const variable = this.variables[i];

      // Sets texture dependencies uniforms
      if (variable.dependencies !== null) {
        const uniforms = variable.material.uniforms;

        for (let d = 0, dl = variable.dependencies.length; d < dl; d++) {
          const depVar = variable.dependencies[d];

          uniforms[depVar.name].value =
            depVar.renderTargets[currentTextureIndex].texture;
        }
      }

      // Performs the computation for this variable
      this.doRenderTarget(
        variable.material,
        variable.renderTargets[nextTextureIndex],
      );
    }

    this.currentTextureIndex = nextTextureIndex;
  }

  getCurrentRenderTarget(variable: GPUComputationRendererVariable) {
    return variable.renderTargets[this.currentTextureIndex];
  }

  getAlternateRenderTarget(variable: GPUComputationRendererVariable) {
    return variable.renderTargets[this.currentTextureIndex === 0 ? 1 : 0];
  }

  dispose() {
    this.mesh.geometry.dispose();
    if (this.mesh.material instanceof Material) {
      this.mesh.material.dispose();
    } else {
      this.mesh.material.forEach((material) => {
        material.dispose();
      });
    }

    const variables = this.variables;

    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];

      if (variable.initialValueTexture) variable.initialValueTexture.dispose();

      const renderTargets = variable.renderTargets;

      for (let j = 0; j < renderTargets.length; j++) {
        const renderTarget = renderTargets[j];
        renderTarget.dispose();
      }
    }
  }

  addResolutionDefine(materialShader: ShaderMaterial) {
    materialShader.defines.resolution =
      "vec2( " + this.sizeX.toFixed(1) + ", " + this.sizeY.toFixed(1) + " )";
  }

  // The following functions can be used to compute things manually

  createShaderMaterial(computeFragmentShader: string, uniforms?: any) {
    uniforms = uniforms || {};

    const material = new ShaderMaterial({
      uniforms: uniforms,
      vertexShader: this.getPassThroughVertexShader(),
      fragmentShader: computeFragmentShader,
    });

    this.addResolutionDefine(material);

    return material;
  }

  createRenderTarget(
    sizeXTexture?: number,
    sizeYTexture?: number,
    wrapS?: THREE.Wrapping,
    wrapT?: THREE.Wrapping,
    minFilter?: THREE.MinificationTextureFilter,
    magFilter?: THREE.MagnificationTextureFilter,
  ) {
    sizeXTexture = sizeXTexture || this.sizeX;
    sizeYTexture = sizeYTexture || this.sizeY;

    wrapS = wrapS || ClampToEdgeWrapping;
    wrapT = wrapT || ClampToEdgeWrapping;

    minFilter = minFilter || NearestFilter;
    magFilter = magFilter || NearestFilter;

    const renderTarget = new WebGLRenderTarget(sizeXTexture, sizeYTexture, {
      wrapS: wrapS,
      wrapT: wrapT,
      minFilter: minFilter,
      magFilter: magFilter,
      format: RGBAFormat,
      type: this.dataType,
      depthBuffer: false,
    });

    return renderTarget;
  }

  createTexture(data?: Float32Array) {
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

  renderTexture(input: Texture, output: WebGLRenderTarget) {
    this.passThruUniforms.passThruTexture.value = input;

    this.doRenderTarget(this.passThruShader, output);

    this.passThruUniforms.passThruTexture.value = null;
  }

  doRenderTarget(material: ShaderMaterial, output: WebGLRenderTarget) {
    const currentRenderTarget = this.renderer.getRenderTarget();

    const currentXrEnabled = this.renderer.xr.enabled;
    const currentShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    // @ts-expect-error
    const currentOutputColorSpace = this.renderer.outputColorSpace;
    const currentToneMapping = this.renderer.toneMapping;

    this.renderer.xr.enabled = false; // Avoid camera modification
    this.renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
    // @ts-expect-error
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;

    this.mesh.material = material;
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.camera);
    this.mesh.material = this.passThruShader;

    this.renderer.xr.enabled = currentXrEnabled;
    this.renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    // @ts-expect-error
    this.renderer.outputColorSpace = currentOutputColorSpace;
    this.renderer.toneMapping = currentToneMapping;

    this.renderer.setRenderTarget(currentRenderTarget);
  }

  // Shaders

  getPassThroughVertexShader(): string {
    return (
      "void main()	{\n" +
      "\n" +
      "	gl_Position = vec4( position, 1.0 );\n" +
      "\n" +
      "}\n"
    );
  }

  getPassThroughFragmentShader(): string {
    return (
      "uniform sampler2D passThruTexture;\n" +
      "\n" +
      "void main() {\n" +
      "\n" +
      "	vec2 uv = gl_FragCoord.xy / resolution.xy;\n" +
      "\n" +
      "	gl_FragColor = texture2D( passThruTexture, uv );\n" +
      "\n" +
      "}\n"
    );
  }
}

export { GPUComputationRenderer };
