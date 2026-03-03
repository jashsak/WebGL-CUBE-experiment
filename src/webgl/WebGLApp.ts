import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GPGPUManager } from "./GPGPUManager";
import { particleVertexShader, particleFragmentShader } from "./shaders";
import { PARTICLE_COUNT, SHAPE_MAP } from "../config";

export class WebGLApp {
  container: HTMLElement;
  valuesRef: React.MutableRefObject<any>;
  getFrequencies: () => { bassAvg: number; midAvg: number; trebleAvg: number };
  onTrackChange: (trackName: string) => void;

  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls | null = null;
  particles: THREE.Points | null = null;

  gpgpu: GPGPUManager;
  clock: THREE.Clock;
  raycaster: THREE.Raycaster;
  mouseScreenPos: THREE.Vector2;
  mouseWorldPos: THREE.Vector3;

  currentShapeIdx = 3;
  oldShapeIdx = 3;
  morphTargetProgress = 1.0;
  isMorphing = false;
  rafId = 0;
  currentTrackIdx = 0;
  smoothedBass = 0;
  smoothedMid = 0;
  smoothedTreble = 0;
  introTime = 0;
  audioTime = 0; // Accumulates based on audio volume to drive time-based effects in sync with music

  constructor(
    container: HTMLElement,
    valuesRef: React.MutableRefObject<any>,
    getFrequencies: () => { bassAvg: number; midAvg: number; trebleAvg: number },
    onTrackChange: (trackName: string) => void
  ) {
    this.container = container;
    this.valuesRef = valuesRef;
    this.getFrequencies = getFrequencies;
    this.onTrackChange = onTrackChange;

    const initialShape = SHAPE_MAP[valuesRef.current.shape] ?? 3;
    this.currentShapeIdx = initialShape;
    this.oldShapeIdx = initialShape;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    
    // Closer, more face-on view instead of top-down
    if (initialShape === 4) {
      this.camera.position.set(0, 0, 6.5);
    } else {
      this.camera.position.set(4, 4, 4);
    }
    
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (typeof OrbitControls === 'function') {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.5;
    }

    this.gpgpu = new GPGPUManager(this.renderer, PARTICLE_COUNT);
    this.gpgpu.velVar.material.uniforms.uOldShape.value = this.oldShapeIdx;
    this.gpgpu.velVar.material.uniforms.uCurrentShape.value = this.currentShapeIdx;
    
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouseScreenPos = new THREE.Vector2(-999, -999);
    this.mouseWorldPos = new THREE.Vector3(-999, -999, -999);

    this.initParticles();

    container.appendChild(this.renderer.domElement);

    this.onResize = this.onResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
    this.update = this.update.bind(this);

    window.addEventListener('resize', this.onResize);
    
    // Only use mouse move on non-touch devices to avoid teleporting cursor on mobile
    if (!window.matchMedia("(pointer: coarse)").matches) {
      window.addEventListener('mousemove', this.onMouseMove);
    } else {
      // On mobile, try to use device orientation for a subtle tilt effect instead
      // Note: iOS 13+ requires explicit permission which would need a UI button,
      // but this will work on Android and older iOS automatically.
      window.addEventListener('deviceorientation', this.onDeviceOrientation);
      
      // Place the interaction point in the center by default on mobile
      this.mouseWorldPos.set(0, 0, 0);
    }

    this.update();
  }

  initParticles() {
    const geometry = new THREE.BufferGeometry();
    const uvs = new Float32Array(this.gpgpu.totalParticles * 2);
    const posDummy = new Float32Array(this.gpgpu.totalParticles * 3);
    
    for (let i = 0; i < this.gpgpu.totalParticles; i++) {
       uvs[i * 2] = ((i % this.gpgpu.width) + 0.5) / this.gpgpu.width;
       uvs[i * 2 + 1] = (Math.floor(i / this.gpgpu.width) + 0.5) / this.gpgpu.height;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(posDummy, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFboPos: { value: null },
        uParticleSize: { value: 1.0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uAudioBassScale: { value: 0.4 },
        uAudioMidGlow: { value: 0.2 },
        uAudioTrebleScatter: { value: 0.6 },
        uStructure: { value: 1.0 },
        uTime: { value: 0 },
        uAudioTime: { value: 0 },
        uBassSizeBump: { value: 0.0 },
        uSpeakerConeRadius: { value: 3.0 }
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onMouseMove(ev: MouseEvent) {
    this.mouseScreenPos.x = (ev.clientX / window.innerWidth) * 2 - 1;
    this.mouseScreenPos.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    
    // Convert to world pos on a plane facing the camera for Raycasting.
    this.raycaster.setFromCamera(this.mouseScreenPos, this.camera);
    const normal = new THREE.Vector3().copy(this.camera.position).normalize();
    const plane = new THREE.Plane(normal, 0);
    this.raycaster.ray.intersectPlane(plane, this.mouseWorldPos);
  }

  onDeviceOrientation(ev: DeviceOrientationEvent) {
    // Subtle tilt effect for mobile
    // gamma is left-to-right tilt in degrees, where right is positive
    // beta is front-to-back tilt in degrees, where front is positive
    const tiltX = ev.gamma || 0; 
    const tiltY = ev.beta || 0;

    // Clamp and normalize the tilt to a small range to avoid it moving too much
    // We assume a normal holding angle of beta around 45 degrees
    const normalizedX = Math.max(-1, Math.min(1, tiltX / 45));
    const normalizedY = Math.max(-1, Math.min(1, (tiltY - 45) / 45));

    // Map to screen coordinates (subtle movement, e.g., max 50% of screen)
    this.mouseScreenPos.x = normalizedX * 0.5;
    this.mouseScreenPos.y = -normalizedY * 0.5;

    // Convert to world pos on a plane facing the camera
    this.raycaster.setFromCamera(this.mouseScreenPos, this.camera);
    const normal = new THREE.Vector3().copy(this.camera.position).normalize();
    const plane = new THREE.Plane(normal, 0);
    this.raycaster.ray.intersectPlane(plane, this.mouseWorldPos);
  }

  update() {
    this.rafId = requestAnimationFrame(this.update);
    const dt = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    const v = this.valuesRef.current;

    // Signal track changes
    this.onTrackChange(v.track);

    const { bassAvg, midAvg, trebleAvg } = this.getFrequencies();
    
    // Smooth audio to make the visualizer feel fluid instead of jittery/bouncy
    const smoothFactor = v.audioSmoothing !== undefined ? v.audioSmoothing : 0.2;
    this.smoothedBass += (bassAvg - this.smoothedBass) * (1.0 - smoothFactor);
    this.smoothedMid += (midAvg - this.smoothedMid) * (1.0 - smoothFactor);
    this.smoothedTreble += (trebleAvg - this.smoothedTreble) * (1.0 - smoothFactor);
    
    // Accumulate time ONLY based on music volume (so waves stop when music stops)
    this.audioTime += dt * (this.smoothedMid * 15.0 + this.smoothedBass * 5.0);

    // Handle Morphing
    const targetShape = SHAPE_MAP[v.shape] ?? this.currentShapeIdx;
    if (targetShape !== this.currentShapeIdx) {
      this.oldShapeIdx = this.currentShapeIdx;
      this.currentShapeIdx = targetShape;
      this.isMorphing = true;
      this.morphTargetProgress = 0.0;
      this.gpgpu.velVar.material.uniforms.uOldShape.value = this.oldShapeIdx;
      this.gpgpu.velVar.material.uniforms.uCurrentShape.value = this.currentShapeIdx;
    }

    if (this.isMorphing) {
      this.morphTargetProgress += dt * 1.5;
      if (this.morphTargetProgress >= 1.0) {
        this.morphTargetProgress = 1.0;
        this.isMorphing = false;
        this.gpgpu.velVar.material.uniforms.uOldShape.value = this.currentShapeIdx;
      }
      this.gpgpu.velVar.material.uniforms.uMorphProgress.value = this.morphTargetProgress;
    }

    // Intro Animation: Hold at 0.85 for 1.5s, then transition to v.structure over 1.2s
    this.introTime += dt;
    let currentStructure = v.structure;
    
    if (this.introTime < 1.5) {
      currentStructure = 0.85;
    } else if (this.introTime < 2.7) {
      const t = (this.introTime - 1.5) / 1.2;
      const easeOut = 1 - (1 - t) * (1 - t); // Quad ease-out
      currentStructure = 0.85 + (v.structure - 0.85) * easeOut;
    }

    // Update FBO
    this.gpgpu.updateUniforms(elapsedTime, this.smoothedBass, this.smoothedMid, this.smoothedTreble, { ...v, structure: currentStructure }, this.mouseWorldPos);
    this.gpgpu.compute();

    // Update Particles
    if (this.particles) {
      const pU = (this.particles.material as THREE.ShaderMaterial).uniforms;
      pU.uFboPos.value = this.gpgpu.getCurrentPositionTexture();
      pU.uParticleSize.value = v.particleSize;
      pU.uBass.value = this.smoothedBass;
      pU.uMid.value = this.smoothedMid;
      pU.uTreble.value = this.smoothedTreble;
      pU.uAudioBassScale.value = v.audioBassScale;
      pU.uAudioMidGlow.value = v.audioMidGlow;
      pU.uAudioTrebleScatter.value = v.audioTrebleScatter;
      pU.uStructure.value = currentStructure;
      pU.uTime.value = elapsedTime;
      pU.uAudioTime.value = this.audioTime;
      pU.uBassSizeBump.value = v.bassSizeBump !== undefined ? v.bassSizeBump : 0.0;
      pU.uSpeakerConeRadius.value = v.speakerConeRadius !== undefined ? v.speakerConeRadius : 3.0;
    }

    if (this.controls) {
      this.controls.autoRotateSpeed = v.flowSpeed;
      this.controls.autoRotate = v.flowSpeed !== 0;
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  setMaskTexture(texture: THREE.DataTexture) {
    this.gpgpu.setMaskTexture(texture);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    cancelAnimationFrame(this.rafId);
    if (this.container && this.renderer) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
