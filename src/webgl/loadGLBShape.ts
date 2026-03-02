import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

export async function loadGLBShape(url: string, particleCount: number): Promise<THREE.DataTexture> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        let targetMesh: THREE.Mesh | null = null;
        
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && !targetMesh) {
            targetMesh = child as THREE.Mesh;
          }
        });

        if (!targetMesh) {
          reject(new Error("No mesh found in GLB"));
          return;
        }

        const mesh = targetMesh as THREE.Mesh;

        // Calculate bounding box to normalize scale
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        
        // Target scale matches roughly the sphere/cube sizes in geometry.ts
        // sphereRadius is 2.2, cubeSize is 3, so a max dimension around 4.5 across is appropriate
        const targetScale = 4.5; 
        
        let scale = 1.0;
        let center = new THREE.Vector3();
        
        if (bbox) {
          const size = new THREE.Vector3();
          bbox.getSize(size);
          bbox.getCenter(center);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          scale = targetScale / maxDim;
        }

        // Create a sampler for the mesh
        const sampler = new MeshSurfaceSampler(mesh).build();

        // Create a DataTexture to hold the sampled points
        const width = Math.ceil(Math.sqrt(particleCount));
        const height = width;
        const totalParticles = width * height;
        
        const data = new Float32Array(totalParticles * 4);
        const tempPosition = new THREE.Vector3();

        for (let i = 0; i < totalParticles; i++) {
          sampler.sample(tempPosition);
          
          // Apply scale and centering
          tempPosition.sub(center).multiplyScalar(scale);
          
          const i4 = i * 4;
          data[i4] = tempPosition.x;
          data[i4 + 1] = tempPosition.y;
          data[i4 + 2] = tempPosition.z;
          data[i4 + 3] = 1.0;
        }

        const texture = new THREE.DataTexture(
          data,
          width,
          height,
          THREE.RGBAFormat,
          THREE.FloatType
        );
        texture.needsUpdate = true;

        resolve(texture);
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });
}
