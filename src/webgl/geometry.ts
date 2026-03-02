import * as THREE from "three";

export function fillShapeTextures(
  texCube: THREE.DataTexture,
  texSphere: THREE.DataTexture,
  texPyramid: THREE.DataTexture,
  texStar: THREE.DataTexture,
  texNoise: THREE.DataTexture,
  dtPosition: THREE.DataTexture,
  dtVelocity: THREE.DataTexture,
  totalParticles: number
) {
  const starOuter = 3.5, starInner = 1.3, starDepth = 0.8;
  const starPts = [];
  for (let p = 0; p < 10; p++) {
    const ang = (p * Math.PI) / 5 - Math.PI / 2;
    const r = p % 2 === 0 ? starOuter : starInner;
    starPts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r, 0));
  }
  const starFwd = new THREE.Vector3(0, 0, starDepth), starBck = new THREE.Vector3(0, 0, -starDepth);
  const starTris = [];
  for (let p = 0; p < 10; p++) {
    starTris.push([starFwd, starPts[p], starPts[(p + 1) % 10]]);
    starTris.push([starBck, starPts[(p + 1) % 10], starPts[p]]);
  }

  const cubeSize = 3, sphereRadius = 2.2, pyramidSize = 3;

  for (let i = 0; i < totalParticles; i++) {
    const i4 = i * 4;

    // Cube Math
    const cubeType = Math.random();
    let cx, cy, cz;
    if (cubeType < 0.3) {
      const axis = Math.floor(Math.random() * 3);
      cx = axis === 0 ? (Math.random() - 0.5) * cubeSize : (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2;
      cy = axis === 1 ? (Math.random() - 0.5) * cubeSize : (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2;
      cz = axis === 2 ? (Math.random() - 0.5) * cubeSize : (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2;
    } else if (cubeType < 0.7) {
      const axis = Math.floor(Math.random() * 3);
      cx = axis === 0 ? (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2 : (Math.random() - 0.5) * cubeSize;
      cy = axis === 1 ? (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2 : (Math.random() - 0.5) * cubeSize;
      cz = axis === 2 ? (Math.random() < 0.5 ? -1 : 1) * cubeSize / 2 : (Math.random() - 0.5) * cubeSize;
    } else {
      cx = (Math.random() - 0.5) * cubeSize; cy = (Math.random() - 0.5) * cubeSize; cz = (Math.random() - 0.5) * cubeSize;
    }
    texCube.image.data[i4] = cx; texCube.image.data[i4 + 1] = cy; texCube.image.data[i4 + 2] = cz; texCube.image.data[i4 + 3] = 1;

    // Sphere Math
    const isSurface = Math.random() < 0.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const r = isSurface ? sphereRadius : sphereRadius * Math.cbrt(Math.random());
    texSphere.image.data[i4] = r * Math.sin(phi) * Math.cos(theta);
    texSphere.image.data[i4 + 1] = r * Math.sin(phi) * Math.sin(theta);
    texSphere.image.data[i4 + 2] = r * Math.cos(phi);
    texSphere.image.data[i4 + 3] = 1;

    // Pyramid Math
    const v0 = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(pyramidSize);
    const v1 = new THREE.Vector3(-1, -1, 1).normalize().multiplyScalar(pyramidSize);
    const v2 = new THREE.Vector3(-1, 1, -1).normalize().multiplyScalar(pyramidSize);
    const v3 = new THREE.Vector3(1, -1, -1).normalize().multiplyScalar(pyramidSize);
    let a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
    if (Math.random() < 0.4) a = 0; if (Math.random() < 0.1) b = 0;
    const sum = a + b + c + d; a /= sum; b /= sum; c /= sum; d /= sum;
    texPyramid.image.data[i4] = a * v0.x + b * v1.x + c * v2.x + d * v3.x;
    texPyramid.image.data[i4 + 1] = a * v0.y + b * v1.y + c * v2.y + d * v3.y;
    texPyramid.image.data[i4 + 2] = a * v0.z + b * v1.z + c * v2.z + d * v3.z;
    texPyramid.image.data[i4 + 3] = 1;

    // Star Math
    const st = starTris[Math.floor(Math.random() * 20)];
    let sa = Math.random(), sb = Math.random();
    if (sa + sb > 1) { sa = 1 - sa; sb = 1 - sb; }
    const stType = Math.random();
    if (stType < 0.3) { sa = Math.random(); sb = 0; }
    else if (stType < 0.6) { sa = 0; sb = Math.random(); }
    else if (stType < 0.7) { sa = Math.random(); sb = 1 - sa; }
    const sc = 1 - sa - sb;
    const starX = sa * st[0].x + sb * st[1].x + sc * st[2].x;
    const starY = sa * st[0].y + sb * st[1].y + sc * st[2].y;
    const starZ = sa * st[0].z + sb * st[1].z + sc * st[2].z;
    texStar.image.data[i4] = starX; texStar.image.data[i4 + 1] = starY; texStar.image.data[i4 + 2] = starZ; texStar.image.data[i4 + 3] = 1;

    // Noise Vector
    const nx = (Math.random() - 0.5) * 2, ny = (Math.random() - 0.5) * 2, nz = (Math.random() - 0.5) * 2;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    texNoise.image.data[i4] = nx / nLen; texNoise.image.data[i4 + 1] = ny / nLen; texNoise.image.data[i4 + 2] = nz / nLen; texNoise.image.data[i4 + 3] = 1;

    // Init Data
    dtPosition.image.data[i4] = starX; dtPosition.image.data[i4 + 1] = starY; dtPosition.image.data[i4 + 2] = starZ; dtPosition.image.data[i4 + 3] = 1;
    dtVelocity.image.data[i4] = 0; dtVelocity.image.data[i4 + 1] = 0; dtVelocity.image.data[i4 + 2] = 0; dtVelocity.image.data[i4 + 3] = 1;
  }
}
