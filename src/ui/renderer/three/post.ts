/**
 * Post-processing: bloom on light sources and a band tilt-shift whose focus
 * band covers the whole playable board (only the backdrop and the diorama
 * edges blur). Both toggleable; with both off the scene renders directly.
 *
 * The addons' Horizontal/VerticalTiltShiftShader blur linearly from a focus
 * line, which would soften tiles near the board edge; this variant keeps a
 * flat band sharp and ramps the blur outside it.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const BandTiltShiftShader = {
  name: 'BandTiltShiftShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    /** sharp band in uv space (y up): [bandMin, bandMax] */
    band: { value: new THREE.Vector2(0.2, 0.8) },
    /** uv distance over which blur ramps to full */
    feather: { value: 0.15 },
    /** full blur radius in pixels */
    maxBlur: { value: 3.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec2 band;
    uniform float feather;
    uniform float maxBlur;
    varying vec2 vUv;
    void main() {
      float d = max(band.x - vUv.y, vUv.y - band.y);
      float amount = clamp(d / max(feather, 1e-4), 0.0, 1.0) * maxBlur;
      if (amount < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 px = amount / resolution;
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        for (int j = -3; j <= 3; j++) {
          float w = exp(-float(i * i + j * j) / 6.0);
          sum += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px) * w;
          wsum += w;
        }
      }
      gl_FragColor = sum / wsum;
    }`,
};

export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private band: ShaderPass;
  private output = new OutputPass();
  bloomEnabled = true;
  blurEnabled = true;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // threshold above 1: only HDR emitters (bulbs) bloom, not a white sprite standing in daylight
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 1.05);
    this.band = new ShaderPass(BandTiltShiftShader);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.band);
    this.composer.addPass(this.output);
  }

  get active(): boolean {
    return this.bloomEnabled || this.blurEnabled;
  }

  setEnabled(opts: { bloom?: boolean; blur?: boolean }): void {
    if (opts.bloom !== undefined) this.bloomEnabled = opts.bloom;
    if (opts.blur !== undefined) this.blurEnabled = opts.blur;
    this.bloom.enabled = this.bloomEnabled;
    this.band.enabled = this.blurEnabled;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    const pr = this.renderer.getPixelRatio();
    (this.band.uniforms.resolution as THREE.IUniform<THREE.Vector2>).value.set(width * pr, height * pr);
  }

  /** Sharp band in CSS-pixel y (top-down); converted to uv (bottom-up). */
  setFocusBand(yTopPx: number, yBottomPx: number, heightPx: number, featherPx = 90): void {
    const toUv = (y: number) => 1 - y / heightPx;
    const b = (this.band.uniforms.band as THREE.IUniform<THREE.Vector2>).value;
    b.set(toUv(yBottomPx + 8), toUv(yTopPx - 8));
    (this.band.uniforms.feather as THREE.IUniform<number>).value = featherPx / heightPx;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
    this.band.dispose();
    this.output.dispose();
  }
}
