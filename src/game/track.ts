import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { CircuitId } from './types';

export interface TrackProjection {
  t: number; // [0, 1)
  sampleIndex: number;
  lateralOffset: number; // signed distance from centerline (+ = right, - = left)
  groundY: number;
  pointX: number;
  pointZ: number;
  tangentX: number;
  tangentZ: number;
}

export interface BuiltTrack {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  roadWidth: number;
  totalLength: number;
  minimapPathD: string;
  toMinimapCoords: (x: number, z: number) => { x: number; y: number };
  projectOntoTrack: (x: number, z: number, hintIndex: number, out: TrackProjection) => void;
  getSpawnTransform: (
    gridIndex: number,
  ) => { x: number; y: number; z: number; heading: number; sampleIndex: number };
  setStartLightState: (state: 'red' | 'amber' | 'green' | 'off') => void;
  dispose: () => void;
}

const TRACK_SAMPLES = 640;

function getControlPoints(circuitId: CircuitId): THREE.Vector3[] {
  if (circuitId === 'coastal') {
    return [
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 0.05, 110),
      new THREE.Vector3(18, 0.4, 215),
      new THREE.Vector3(85, 1.8, 285),
      new THREE.Vector3(185, 3.2, 295),
      new THREE.Vector3(270, 2.4, 235),
      new THREE.Vector3(295, 1.2, 130),
      new THREE.Vector3(250, 0.6, 40),
      new THREE.Vector3(280, 1.4, -55),
      new THREE.Vector3(255, 2.2, -155),
      new THREE.Vector3(170, 1.8, -210),
      new THREE.Vector3(75, 0.8, -175),
      new THREE.Vector3(22, 0.2, -110),
      new THREE.Vector3(0, 0.05, -55),
    ];
  }

  // Midnight Harbor GP: technical marina layout with sweeping curve + chicane
  return [
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(0, 0.05, 115),
    new THREE.Vector3(28, 0.15, 210),
    new THREE.Vector3(115, 0.35, 250),
    new THREE.Vector3(210, 0.2, 215),
    new THREE.Vector3(235, 0.1, 130),
    new THREE.Vector3(165, 0.15, 70),
    new THREE.Vector3(155, 0.25, -10),
    new THREE.Vector3(235, 0.45, -75),
    new THREE.Vector3(225, 0.3, -175),
    new THREE.Vector3(135, 0.15, -215),
    new THREE.Vector3(45, 0.08, -175),
    new THREE.Vector3(6, 0.05, -95),
    new THREE.Vector3(0, 0.05, -45),
  ];
}

function buildRibbonGeometry(
  points: THREE.Vector3[],
  normals: THREE.Vector3[],
  innerOffset: number,
  outerOffset: number,
  yOffset: number,
  uvRepeatLength: number,
): THREE.BufferGeometry {
  const count = points.length;
  const positions = new Float32Array((count + 1) * 2 * 3);
  const uvs = new Float32Array((count + 1) * 2 * 2);
  const indices: number[] = [];

  let accumDist = 0;
  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const p = points[idx];
    const n = normals[idx];

    if (i > 0) {
      const prev = points[(i - 1) % count];
      accumDist += p.distanceTo(prev);
    }

    const vCoord = accumDist / uvRepeatLength;

    const lx = p.x + n.x * innerOffset;
    const ly = p.y + yOffset;
    const lz = p.z + n.z * innerOffset;

    const rx = p.x + n.x * outerOffset;
    const ry = p.y + yOffset;
    const rz = p.z + n.z * outerOffset;

    const basePos = i * 6;
    positions[basePos] = lx;
    positions[basePos + 1] = ly;
    positions[basePos + 2] = lz;
    positions[basePos + 3] = rx;
    positions[basePos + 4] = ry;
    positions[basePos + 5] = rz;

    const baseUv = i * 4;
    uvs[baseUv] = 0;
    uvs[baseUv + 1] = vCoord;
    uvs[baseUv + 2] = 1;
    uvs[baseUv + 3] = vCoord;

    if (i < count) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildCircuitTrack(
  circuitId: CircuitId,
  roadWidth: number,
  textures: ProceduralTextureSet,
  castShadow: boolean,
): BuiltTrack {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const controlPts = getControlPoints(circuitId);
  const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();

  const samples: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = []; // right-hand horizontal normal

  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t = i / TRACK_SAMPLES;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    // Horizontal right normal: cross(tangent, up) -> ( -tan.z, 0, tan.x )?
    // Let's check: tangent=(0,0,1) (+Z). Up=(0,1,0).
    // tangent x up = (0,0,1) x (0,1,0) = (-1, 0, 0).
    // Up x tangent = (0,1,0) x (0,0,1) = (1, 0, 0).
    // Either is perpendicular! Let's define rightNormal = (-tan.z, 0, tan.x).normalized
    const nx = -tan.z;
    const nz = tan.x;
    const len = Math.hypot(nx, nz) || 1;
    samples.push(p);
    tangents.push(tan);
    normals.push(new THREE.Vector3(nx / len, 0, nz / len));
  }

  // 1. Ground Terrain Plane (well below road height >= 0.05)
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(2400, 2400));
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainMap,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.set(130, -0.25, 30);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 2. Shoulder / Gravel Runoff Apron
  const halfW = roadWidth / 2;
  const shoulderGeo = trackGeo(
    buildRibbonGeometry(samples, normals, -(halfW + 5.2), halfW + 5.2, -0.08, 18),
  );
  const shoulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: circuitId === 'coastal' ? 0x6b7068 : 0x1e293b,
      roughness: 0.95,
      metalness: 0.05,
    }),
  );
  const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
  shoulderMesh.receiveShadow = true;
  group.add(shoulderMesh);

  // 3. Main Asphalt Road Surface
  const roadGeo = trackGeo(
    buildRibbonGeometry(samples, normals, -halfW, halfW, 0.0, 14),
  );
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltMap,
      roughnessMap: textures.asphaltRoughnessMap,
      roughness: circuitId === 'coastal' ? 0.82 : 0.45,
      metalness: 0.08,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 4. Inner & Outer Rumble Curbs
  const curbWidth = 1.25;
  const leftCurbGeo = trackGeo(
    buildRibbonGeometry(samples, normals, -(halfW + curbWidth), -halfW, 0.025, 4.5),
  );
  const rightCurbGeo = trackGeo(
    buildRibbonGeometry(samples, normals, halfW, halfW + curbWidth, 0.025, 4.5),
  );
  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.curbMap,
      roughness: 0.72,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const leftCurb = new THREE.Mesh(leftCurbGeo, curbMat);
  leftCurb.receiveShadow = true;
  const rightCurb = new THREE.Mesh(rightCurbGeo, curbMat);
  rightCurb.receiveShadow = true;
  group.add(leftCurb, rightCurb);

  // 5. Start/Finish Checkered Line & Overhead Race Gantry
  const startPt = samples[0];
  const startTan = tangents[0];
  const startHeading = Math.atan2(startTan.x, startTan.z);

  const startLineGeo = trackGeo(new THREE.PlaneGeometry(roadWidth - 0.6, 4.0));
  startLineGeo.rotateX(-Math.PI / 2);
  const startLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.startLineMap,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const startLineMesh = new THREE.Mesh(startLineGeo, startLineMat);
  startLineMesh.position.set(startPt.x, startPt.y + 0.02, startPt.z);
  startLineMesh.rotation.y = startHeading;
  startLineMesh.receiveShadow = true;
  group.add(startLineMesh);

  // Overhead Gantry Structure
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(startPt.x, startPt.y, startPt.z);
  gantryGroup.rotation.y = startHeading;
  group.add(gantryGroup);

  const trussMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.35,
    }),
  );
  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.9, 7.6, 0.9));
  const pillarL = new THREE.Mesh(pillarGeo, trussMat);
  pillarL.position.set(halfW + 1.8, 3.8, 0);
  pillarL.castShadow = castShadow;
  const pillarR = new THREE.Mesh(pillarGeo, trussMat);
  pillarR.position.set(-(halfW + 1.8), 3.8, 0);
  pillarR.castShadow = castShadow;
  gantryGroup.add(pillarL, pillarR);

  const crossBeamGeo = trackGeo(new THREE.BoxGeometry(roadWidth + 4.8, 1.8, 1.1));
  const crossBeam = new THREE.Mesh(crossBeamGeo, trussMat);
  crossBeam.position.set(0, 7.2, 0);
  crossBeam.castShadow = castShadow;
  gantryGroup.add(crossBeam);

  const bannerGeo = trackGeo(new THREE.PlaneGeometry(roadWidth + 2.8, 1.55));
  const bannerMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.gantryBannerMap,
      side: THREE.DoubleSide,
    }),
  );
  const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
  bannerFront.position.set(0, 7.2, -0.57);
  bannerFront.rotation.y = Math.PI;
  const bannerBack = new THREE.Mesh(bannerGeo, bannerMat);
  bannerBack.position.set(0, 7.2, 0.57);
  gantryGroup.add(bannerFront, bannerBack);

  // Start Lights Pods (3 lights centered under gantry)
  const lightPodMats: THREE.MeshStandardMaterial[] = [];
  const podGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16));
  podGeo.rotateX(Math.PI / 2);
  for (let i = -1; i <= 1; i++) {
    const podMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x000000,
        emissiveIntensity: 2.5,
        roughness: 0.3,
      }),
    );
    lightPodMats.push(podMat);
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set(i * 1.1, 6.0, -0.45);
    gantryGroup.add(pod);
  }

  // 6. Trackside Grandstands near Start/Finish Straight
  const standGroup = new THREE.Group();
  standGroup.position.set(startPt.x, startPt.y, startPt.z);
  standGroup.rotation.y = startHeading;
  group.add(standGroup);

  const standMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
    }),
  );
  const roofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.35,
    }),
  );
  const standBaseGeo = trackGeo(new THREE.BoxGeometry(8, 5.5, 42));
  const standRoofGeo = trackGeo(new THREE.BoxGeometry(9.5, 0.4, 43));

  const standL = new THREE.Mesh(standBaseGeo, standMat);
  standL.position.set(halfW + 13, 2.75, 18);
  standL.castShadow = castShadow;
  standL.receiveShadow = true;
  const roofL = new THREE.Mesh(standRoofGeo, roofMat);
  roofL.position.set(halfW + 12.2, 7.2, 18);
  roofL.rotation.z = 0.14;
  standGroup.add(standL, roofL);

  // 7. Instanced Trackside Guardrail Posts & Barrier Blocks
  const postStep = 4; // every 4 samples (~160 posts per side = ~320 total)
  const postCount = Math.floor(TRACK_SAMPLES / postStep) * 2;
  const barrierGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.85, 3.6));
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.25,
    }),
  );
  const barrierInstanced = new THREE.InstancedMesh(barrierGeo, barrierMat, postCount);
  barrierInstanced.castShadow = false;
  barrierInstanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const cRed = new THREE.Color(circuitId === 'coastal' ? 0xdc2626 : 0xf59e0b);
  const cWhite = new THREE.Color(0xe2e8f0);
  let bIdx = 0;

  for (let i = 0; i < TRACK_SAMPLES; i += postStep) {
    const p = samples[i];
    const n = normals[i];
    const tan = tangents[i];
    const heading = Math.atan2(tan.x, tan.z);

    for (const side of [-1, 1]) {
      if (bIdx >= postCount) break;
      const offset = side * (halfW + 4.4);
      dummy.position.set(p.x + n.x * offset, p.y + 0.38, p.z + n.z * offset);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      barrierInstanced.setMatrixAt(bIdx, dummy.matrix);
      barrierInstanced.setColorAt(bIdx, (i / postStep) % 2 === 0 ? cRed : cWhite);
      bIdx++;
    }
  }
  barrierInstanced.instanceMatrix.needsUpdate = true;
  if (barrierInstanced.instanceColor) barrierInstanced.instanceColor.needsUpdate = true;
  barrierInstanced.computeBoundingSphere();
  group.add(barrierInstanced);

  // 8. Instanced Trackside Environment Props (Trees for Coastal Day, Floodlight Towers for Harbor Night)
  if (circuitId === 'coastal') {
    const treeCount = 140;
    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 7));
    const canopyGeo = trackGeo(new THREE.ConeGeometry(2.3, 6.4, 8));
    const trunkMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }),
    );
    const canopyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    canopies.castShadow = castShadow;

    let tIdx = 0;
    const leafColors = [
      new THREE.Color(0x2d5a27),
      new THREE.Color(0x3a6b31),
      new THREE.Color(0x234922),
      new THREE.Color(0x4a7c38),
    ];

    for (let i = 0; i < treeCount; i++) {
      const sampleIdx = Math.floor((i / treeCount) * TRACK_SAMPLES);
      const p = samples[sampleIdx];
      const n = normals[sampleIdx];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = halfW + 14 + ((i * 37) % 38);
      const tx = p.x + n.x * side * dist;
      const tz = p.z + n.z * side * dist;

      // Keep clear of other track segments
      let tooClose = false;
      for (let k = 0; k < TRACK_SAMPLES; k += 8) {
        const sp = samples[k];
        const dSq = (tx - sp.x) * (tx - sp.x) + (tz - sp.z) * (tz - sp.z);
        if (dSq < (halfW + 8) * (halfW + 8)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const s = 0.85 + ((i * 19) % 30) / 100; // ±15% scale variation
      dummy.position.set(tx, 1.4 * s - 0.25, tz);
      dummy.rotation.set(0, (i * 1.7) % Math.PI, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(tIdx, dummy.matrix);

      dummy.position.set(tx, 5.2 * s - 0.25, tz);
      dummy.updateMatrix();
      canopies.setMatrixAt(tIdx, dummy.matrix);
      canopies.setColorAt(tIdx, leafColors[i % leafColors.length]);
      tIdx++;
    }
    trunks.count = tIdx;
    canopies.count = tIdx;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    group.add(trunks, canopies);
  } else {
    // Harbor Night Track: Trackside Floodlight Poles + Glowing Light Heads
    const poleCount = 48;
    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 10.5, 8));
    const lampGeo = trackGeo(new THREE.BoxGeometry(1.4, 0.35, 0.6));
    const poleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 }),
    );
    const lampMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xe0f2fe,
        emissiveIntensity: 3.0,
      }),
    );
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, poleCount);

    let lIdx = 0;
    for (let i = 0; i < poleCount; i++) {
      const sIdx = Math.floor((i / poleCount) * TRACK_SAMPLES);
      const p = samples[sIdx];
      const n = normals[sIdx];
      const tan = tangents[sIdx];
      const side = i % 2 === 0 ? 1 : -1;
      const offset = side * (halfW + 6.5);
      const heading = Math.atan2(tan.x, tan.z);

      dummy.position.set(p.x + n.x * offset, p.y + 5.0, p.z + n.z * offset);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(lIdx, dummy.matrix);

      dummy.position.set(
        p.x + n.x * (offset - side * 0.7),
        p.y + 10.1,
        p.z + n.z * (offset - side * 0.7),
      );
      dummy.updateMatrix();
      lamps.setMatrixAt(lIdx, dummy.matrix);
      lIdx++;
    }
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    lamps.computeBoundingSphere();
    group.add(poles, lamps);
  }

  // 9. Distant Perimeter Landmarks (Mountains / Harbor Skyline Silhouettes)
  const landmarkCount = 34;
  const landmarkGeo = trackGeo(
    circuitId === 'coastal'
      ? new THREE.ConeGeometry(48, 72, 6)
      : new THREE.BoxGeometry(28, 85, 28),
  );
  const landmarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: circuitId === 'coastal' ? 0x4b5d67 : 0x0f172a,
      roughness: 0.9,
      metalness: circuitId === 'coastal' ? 0.05 : 0.4,
    }),
  );
  const landmarks = new THREE.InstancedMesh(landmarkGeo, landmarkMat, landmarkCount);
  for (let i = 0; i < landmarkCount; i++) {
    const angle = (i / landmarkCount) * Math.PI * 2;
    const rad = 460 + ((i * 53) % 180);
    const lx = 135 + Math.cos(angle) * rad;
    const lz = 30 + Math.sin(angle) * rad;
    const sy = 0.65 + ((i * 29) % 70) / 100;
    const sx = 0.8 + ((i * 17) % 45) / 100;
    dummy.position.set(lx, (circuitId === 'coastal' ? 30 : 38) * sy - 1, lz);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    landmarks.setMatrixAt(i, dummy.matrix);
  }
  landmarks.instanceMatrix.needsUpdate = true;
  landmarks.computeBoundingSphere();
  group.add(landmarks);

  // 10. Atmospheric Sky Dome
  const skyGeo = trackGeo(new THREE.SphereGeometry(1100, 24, 16));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.skyMap,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.set(135, 0, 30);
  group.add(skyDome);

  // Compute Minimap Bounding Box & SVG Path
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const p = samples[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const pad = 10;
  const usable = 100 - pad * 2;
  const offsetX = pad + (usable - ((maxX - minX) / span) * usable) / 2;
  const offsetZ = pad + (usable - ((maxZ - minZ) / span) * usable) / 2;

  const toMinimapCoords = (wx: number, wz: number) => ({
    x: offsetX + ((wx - minX) / span) * usable,
    y: offsetZ + ((wz - minZ) / span) * usable,
  });

  const pathPts: string[] = [];
  for (let i = 0; i < TRACK_SAMPLES; i += 4) {
    const mc = toMinimapCoords(samples[i].x, samples[i].z);
    pathPts.push(`${i === 0 ? 'M' : 'L'} ${mc.x.toFixed(1)} ${mc.y.toFixed(1)}`);
  }
  pathPts.push('Z');
  const minimapPathD = pathPts.join(' ');

  // Fast Zero-GC Spatial Track Projection
  const projectOntoTrack = (
    x: number,
    z: number,
    hintIndex: number,
    out: TrackProjection,
  ) => {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintIndex >= 0 && hintIndex < TRACK_SAMPLES) {
      const windowRadius = 32;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (hintIndex + offset + TRACK_SAMPLES) % TRACK_SAMPLES;
        const p = samples[idx];
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    // Fallback full scan if no hint or car jumped far off-line
    if (bestDistSq > 900 || hintIndex < 0) {
      bestDistSq = Infinity;
      for (let i = 0; i < TRACK_SAMPLES; i++) {
        const p = samples[i];
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const p0 = samples[bestIdx];
    const t0 = tangents[bestIdx];
    const n0 = normals[bestIdx];

    const relX = x - p0.x;
    const relZ = z - p0.z;
    const along = relX * t0.x + relZ * t0.z;
    const lateral = relX * n0.x + relZ * n0.z;

    const segLen = totalLength / TRACK_SAMPLES;
    const rawT = (bestIdx + along / segLen) / TRACK_SAMPLES;
    const wrappedT = ((rawT % 1) + 1) % 1;

    out.t = wrappedT;
    out.sampleIndex = bestIdx;
    out.lateralOffset = lateral;
    out.groundY = p0.y;
    out.pointX = p0.x + t0.x * along;
    out.pointZ = p0.z + t0.z * along;
    out.tangentX = t0.x;
    out.tangentZ = t0.z;
  };

  const getSpawnTransform = (gridIndex: number) => {
    // Staggered 2-column starting grid behind the start/finish line
    const row = Math.floor(gridIndex / 2);
    const col = gridIndex % 2 === 0 ? -1 : 1;
    const sampleBack = 8 + row * 7;
    const sIdx = (TRACK_SAMPLES - sampleBack) % TRACK_SAMPLES;
    const p = samples[sIdx];
    const n = normals[sIdx];
    const tan = tangents[sIdx];
    const lat = col * 2.8;
    return {
      x: p.x + n.x * lat,
      y: p.y,
      z: p.z + n.z * lat,
      heading: Math.atan2(tan.x, tan.z),
      sampleIndex: sIdx,
    };
  };

  const setStartLightState = (state: 'red' | 'amber' | 'green' | 'off') => {
    lightPodMats.forEach((m) => {
      if (state === 'red') m.emissive.setHex(0xef4444);
      else if (state === 'amber') m.emissive.setHex(0xf59e0b);
      else if (state === 'green') m.emissive.setHex(0x22c55e);
      else m.emissive.setHex(0x000000);
    });
  };

  return {
    group,
    curve,
    roadWidth,
    totalLength,
    minimapPathD,
    toMinimapCoords,
    projectOntoTrack,
    getSpawnTransform,
    setStartLightState,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
