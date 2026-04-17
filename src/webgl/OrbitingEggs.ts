import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

const POINTS_PER_EGG = 80000;

const eggVertexShader = `
uniform float uPointSize;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

varying float vAlpha;

void main() {
    vec3 pos = position;

    // Bass: breathing scale pulse
    pos *= 1.0 + uBass * 0.15;

    // Treble: subtle scatter along surface normal direction (approximate with position direction)
    vec3 scatterDir = normalize(pos + vec3(0.0001));
    pos += scatterDir * uTreble * 0.04;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size bumps slightly with mid
    gl_PointSize = uPointSize * (1.0 + uMid * 0.3) * (10.0 / -mvPosition.z);

    // Brightness reacts to bass + mid
    vAlpha = 0.6 + uBass * 0.3 + uMid * 0.1;
}
`;

const eggFragmentShader = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, ll) * vAlpha * 0.8);
}
`;

export interface OrbitParams {
  speed: number;
  count: number;
  radius: number;
  tilt: number;
  eggScale: number;
  bass: number;
  mid: number;
  treble: number;
}

/**
 * Sample points on a GLB mesh surface and return them as a centered, normalized Float32Array.
 * The positions are normalized to fit within a unit sphere (max extent = 1).
 */
async function sampleGLBPositions(url: string, count: number): Promise<Float32Array> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  // Collect ALL meshes so we capture every detail/part of the model
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });

  if (meshes.length === 0) throw new Error("No mesh found in GLB");

  // Compute overall bounding box across all meshes
  const overallBox = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    overallBox.union(geo.boundingBox!);
    geo.dispose();
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  overallBox.getSize(size);
  overallBox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 1.0 / maxDim : 1.0;

  // Build samplers for each mesh, weight point distribution by surface area
  const samplers: { sampler: MeshSurfaceSampler; matrix: THREE.Matrix4 }[] = [];
  const areas: number[] = [];
  for (const mesh of meshes) {
    // Create a world-space geometry for accurate sampling
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const tempMesh = new THREE.Mesh(geo);
    const sampler = new MeshSurfaceSampler(tempMesh).build();
    samplers.push({ sampler, matrix: new THREE.Matrix4() }); // already in world space
    // Estimate area from triangle count as a rough proxy
    const triCount = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    areas.push(triCount);
  }

  // Distribute points proportionally across meshes
  const totalArea = areas.reduce((a, b) => a + b, 0);
  const positions = new Float32Array(count * 3);
  const temp = new THREE.Vector3();
  let idx = 0;

  for (let m = 0; m < samplers.length; m++) {
    const pointsForMesh = m === samplers.length - 1
      ? count - idx // last mesh gets remainder
      : Math.round((areas[m] / totalArea) * count);

    for (let i = 0; i < pointsForMesh && idx < count; i++) {
      samplers[m].sampler.sample(temp);
      temp.sub(center).multiplyScalar(scale);
      positions[idx * 3] = temp.x;
      positions[idx * 3 + 1] = temp.y;
      positions[idx * 3 + 2] = temp.z;
      idx++;
    }
  }

  return positions;
}

function createEggPoints(positions: Float32Array, color: THREE.Color): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPointSize: { value: 0.6 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uColor: { value: color.clone() },
    },
    vertexShader: eggVertexShader,
    fragmentShader: eggFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export class OrbitingEggs {
  private orbitGroup: THREE.Group;
  private scene: THREE.Scene;
  private eggs: THREE.Points[] = [];
  private positionsA: Float32Array | null = null;
  private positionsB: Float32Array | null = null;
  private rotationAngle = 0;
  private currentCount = 0;
  private currentColor = new THREE.Color(1, 1, 1);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.orbitGroup = new THREE.Group();
    scene.add(this.orbitGroup);
  }

  setColor(color: THREE.Color) {
    this.currentColor.copy(color);
    for (const egg of this.eggs) {
      (egg.material as THREE.ShaderMaterial).uniforms.uColor.value.copy(color);
    }
  }

  async loadModels(urlA: string, urlB: string) {
    [this.positionsA, this.positionsB] = await Promise.all([
      sampleGLBPositions(urlA, POINTS_PER_EGG),
      sampleGLBPositions(urlB, POINTS_PER_EGG),
    ]);
  }

  private rebuildEggs(count: number) {
    for (const egg of this.eggs) {
      egg.geometry.dispose();
      (egg.material as THREE.ShaderMaterial).dispose();
      this.orbitGroup.remove(egg);
    }
    this.eggs = [];

    if (!this.positionsA || !this.positionsB) return;

    const n = Math.max(2, count);
    this.currentCount = n;

    for (let i = 0; i < n; i++) {
      const positions = i % 2 === 0 ? this.positionsA : this.positionsB;
      const points = createEggPoints(new Float32Array(positions), this.currentColor);
      this.orbitGroup.add(points);
      this.eggs.push(points);
    }
  }

  update(dt: number, params: OrbitParams) {
    const targetCount = Math.max(2, Math.round(params.count));
    if (targetCount !== this.currentCount) {
      this.rebuildEggs(targetCount);
    }

    this.rotationAngle += dt * params.speed;

    // Tilt the orbit plane
    this.orbitGroup.rotation.x = (params.tilt * Math.PI) / 180;

    const n = this.eggs.length;
    for (let i = 0; i < n; i++) {
      const angle = this.rotationAngle + (2 * Math.PI * i) / n;
      const egg = this.eggs[i];

      // Position on orbit circle (XZ plane)
      egg.position.set(
        Math.cos(angle) * params.radius,
        0,
        Math.sin(angle) * params.radius
      );

      // Scale — positions are normalized to unit size, eggScale controls display size
      egg.scale.setScalar(params.eggScale);

      // Face direction of travel
      egg.rotation.y = -angle + Math.PI / 2;

      // Update uniforms
      const u = (egg.material as THREE.ShaderMaterial).uniforms;
      u.uPointSize.value = 0.6;
      u.uBass.value = params.bass;
      u.uMid.value = params.mid;
      u.uTreble.value = params.treble;
    }
  }

  destroy() {
    for (const egg of this.eggs) {
      egg.geometry.dispose();
      (egg.material as THREE.ShaderMaterial).dispose();
      this.orbitGroup.remove(egg);
    }
    this.eggs = [];
    this.scene.remove(this.orbitGroup);
  }
}
