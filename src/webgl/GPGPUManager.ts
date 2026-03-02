import * as THREE from "three";
import { GPUComputationRenderer, Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { fboPositionShader, fboVelocityShader } from "./shaders";
import { fillShapeTextures } from "./geometry";

export class GPGPUManager {
  gpuCompute: GPUComputationRenderer;
  posVar: Variable;
  velVar: Variable;

  width: number;
  height: number;
  totalParticles: number;

  constructor(renderer: THREE.WebGLRenderer, targetParticleCount: number) {
    this.width = Math.ceil(Math.sqrt(targetParticleCount));
    this.height = this.width;
    this.totalParticles = this.width * this.height;

    this.gpuCompute = new GPUComputationRenderer(this.width, this.height, renderer);

    const texCube = this.gpuCompute.createTexture();
    const texSphere = this.gpuCompute.createTexture();
    const texPyramid = this.gpuCompute.createTexture();
    const texStar = this.gpuCompute.createTexture();
    const texMask = this.gpuCompute.createTexture();
    const texNoise = this.gpuCompute.createTexture();
    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();

    fillShapeTextures(texCube, texSphere, texPyramid, texStar, texNoise, dtPosition, dtVelocity, this.totalParticles);

    texCube.needsUpdate = true;
    texSphere.needsUpdate = true;
    texPyramid.needsUpdate = true;
    texStar.needsUpdate = true;
    texMask.needsUpdate = true;
    texNoise.needsUpdate = true;
    dtPosition.needsUpdate = true;
    dtVelocity.needsUpdate = true;

    this.posVar = this.gpuCompute.addVariable('texturePosition', fboPositionShader, dtPosition);
    this.velVar = this.gpuCompute.addVariable('textureVelocity', fboVelocityShader, dtVelocity);
    
    this.gpuCompute.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    this.gpuCompute.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    const vU = this.velVar.material.uniforms;
    vU.uTime = { value: 0 };
    vU.texCube = { value: texCube };
    vU.texSphere = { value: texSphere };
    vU.texPyramid = { value: texPyramid };
    vU.texStar = { value: texStar };
    vU.texMask = { value: texMask };
    vU.texNoise = { value: texNoise };
    vU.uOldShape = { value: 3 };
    vU.uCurrentShape = { value: 3 };
    vU.uMorphProgress = { value: 1.0 };
    vU.uStructure = { value: 1.0 };
    vU.uMousePos = { value: new THREE.Vector3(999, 999, 999) };
    vU.uMouseRadius = { value: 3.8 };
    vU.uMouseForce = { value: 0.3 };
    vU.uMouseSwirl = { value: 2.2 };
    vU.uMouseDisruption = { value: 0.9 };
    vU.uBass = { value: 0 };
    vU.uMid = { value: 0 };
    vU.uTreble = { value: 0 };
    vU.uAudioTrebleScatter = { value: 0.6 };
    vU.uAudioBassScale = { value: 0.4 };
    vU.uAudioMidGlow = { value: 0.5 };
    vU.uFlowSpeed = { value: 0.1 };
    vU.uTwistAmount = { value: 1.2 };

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error("GPGPU Init Error:", error);
    }
  }

  compute() {
    this.gpuCompute.compute();
  }

  setMaskTexture(texture: THREE.DataTexture) {
    this.velVar.material.uniforms.texMask.value = texture;
  }

  getCurrentPositionTexture() {
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture;
  }

  updateUniforms(
    elapsedTime: number,
    bassAvg: number, midAvg: number, trebleAvg: number,
    v: any,
    mouseWorldPos: THREE.Vector3
  ) {
    const vU = this.velVar.material.uniforms;
    vU.uTime.value = elapsedTime;
    vU.uBass.value = bassAvg;
    vU.uMid.value = midAvg;
    vU.uTreble.value = trebleAvg;
    vU.uStructure.value = v.structure;
    vU.uMouseRadius.value = v.mouseRadius;
    vU.uMouseForce.value = v.mouseForce;
    vU.uMouseSwirl.value = v.mouseSwirl;
    vU.uMouseDisruption.value = v.mouseDisruption;
    vU.uAudioTrebleScatter.value = v.audioTrebleScatter;
    vU.uAudioBassScale.value = v.audioBassScale;
    vU.uAudioMidGlow.value = v.audioMidGlow;
    vU.uFlowSpeed.value = v.flowSpeed;
    vU.uTwistAmount.value = v.twistAmount;

    if (mouseWorldPos) {
      vU.uMousePos.value.copy(mouseWorldPos);
    }
  }
}
