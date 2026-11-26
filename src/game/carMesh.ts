import * as THREE from 'three';

export interface CarMeshRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  wheels: THREE.Group[]; // [FL, FR, RL, RR] spin around local X
  frontSteerPivots: THREE.Group[]; // [FL, FR] steer around local Y
  brakeLightMat: THREE.MeshStandardMaterial;
  nitroFlames: THREE.Mesh[];
  dispose: () => void;
}

export function createRaceCarMesh(
  primaryColorHex: string,
  accentColorHex: string,
  contactShadowMap: THREE.Texture,
  castShadow: boolean,
): CarMeshRig {
  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

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

  // Materials with strong roughness/metalness contrast
  const paintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(primaryColorHex),
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    }),
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentColorHex),
      metalness: 0.35,
      roughness: 0.32,
    }),
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161a22,
      metalness: 0.25,
      roughness: 0.58,
    }),
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      metalness: 0.94,
      roughness: 0.16,
    }),
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      metalness: 0.04,
      roughness: 0.88,
    }),
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xef4444,
      emissiveIntensity: 1.2,
      roughness: 0.25,
    }),
  );

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );

  // 1. Sculpted Main Chassis Hull (ExtrudeGeometry side profile -> extruded along X)
  // Car forward = +Z, rear = -Z, up = +Y
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-2.15, 0.22); // rear bottom
  hullShape.lineTo(2.15, 0.19);  // front bottom
  hullShape.lineTo(2.26, 0.34);  // front nose tip
  hullShape.lineTo(1.85, 0.62);  // hood slope
  hullShape.lineTo(0.85, 0.78);  // base of windshield
  hullShape.lineTo(0.25, 1.12);  // roof front
  hullShape.lineTo(-0.75, 1.12); // roof rear
  hullShape.lineTo(-1.55, 0.84); // fastback rear deck
  hullShape.lineTo(-2.20, 0.78); // rear decklip
  hullShape.lineTo(-2.22, 0.40); // rear fascia
  hullShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
      steps: 1,
    }),
  );
  // Rotate so shape's X becomes world +Z, shape's Y stays +Y, extrusion depth centers on X=0
  hullGeo.translate(0, 0, -0.86);
  hullGeo.rotateY(-Math.PI / 2);

  const hullMesh = new THREE.Mesh(hullGeo, paintMat);
  hullMesh.castShadow = castShadow;
  hullMesh.receiveShadow = true;
  bodyTiltGroup.add(hullMesh);

  // 2. Central Racing Livery Stripe
  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.025, 3.85));
  const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
  stripeMesh.position.set(0, 0.81, 0.05);
  // Follow roof/hood lightly by adding hood + roof segments
  stripeMesh.visible = false;
  bodyTiltGroup.add(stripeMesh);

  const hoodStripe = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.36, 0.02, 1.12)),
    accentMat,
  );
  hoodStripe.position.set(0, 0.70, 1.40);
  hoodStripe.rotation.x = 0.165;
  bodyTiltGroup.add(hoodStripe);

  const roofStripe = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.36, 0.02, 1.02)),
    accentMat,
  );
  roofStripe.position.set(0, 1.19, -0.25);
  bodyTiltGroup.add(roofStripe);

  // 3. Tinted Greenhouse Cockpit Glass Canopy
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(0.86, 0.76);
  cabinShape.lineTo(0.28, 1.11);
  cabinShape.lineTo(-0.72, 1.11);
  cabinShape.lineTo(-1.42, 0.82);
  cabinShape.lineTo(-0.68, 0.74);
  cabinShape.closePath();

  const cabinGeo = trackGeo(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.38,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    }),
  );
  cabinGeo.translate(0, 0, -0.69);
  cabinGeo.rotateY(-Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.y = 0.03;
  bodyTiltGroup.add(cabinMesh);

  // 4. Lower Carbon Aero Splitter & Side Skirts
  const splitterGeo = trackGeo(new THREE.BoxGeometry(1.94, 0.06, 4.54));
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.21, 0.02);
  splitter.castShadow = castShadow;
  bodyTiltGroup.add(splitter);

  // Side intake pods (left & right)
  const podGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.34, 1.95));
  const leftPod = new THREE.Mesh(podGeo, carbonMat);
  leftPod.position.set(0.95, 0.42, -0.1);
  bodyTiltGroup.add(leftPod);

  const rightPod = new THREE.Mesh(podGeo, carbonMat);
  rightPod.position.set(-0.95, 0.42, -0.1);
  bodyTiltGroup.add(rightPod);

  // 5. Rear GT Wing Spoiler (2 pylons + wing blade + 2 endplates)
  const pylonGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.34, 0.26));
  const pylonL = new THREE.Mesh(pylonGeo, carbonMat);
  pylonL.position.set(0.48, 0.96, -1.96);
  pylonL.rotation.x = -0.2;
  bodyTiltGroup.add(pylonL);

  const pylonR = new THREE.Mesh(pylonGeo, carbonMat);
  pylonR.position.set(-0.48, 0.96, -1.96);
  pylonR.rotation.x = -0.2;
  bodyTiltGroup.add(pylonR);

  const wingGeo = trackGeo(new THREE.BoxGeometry(1.92, 0.055, 0.34));
  const wingMesh = new THREE.Mesh(wingGeo, paintMat);
  wingMesh.position.set(0, 1.13, -2.04);
  wingMesh.rotation.x = 0.14;
  wingMesh.castShadow = castShadow;
  bodyTiltGroup.add(wingMesh);

  const endplateGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.22, 0.40));
  const endplateL = new THREE.Mesh(endplateGeo, carbonMat);
  endplateL.position.set(0.97, 1.11, -2.04);
  bodyTiltGroup.add(endplateL);

  const endplateR = new THREE.Mesh(endplateGeo, carbonMat);
  endplateR.position.set(-0.97, 1.11, -2.04);
  bodyTiltGroup.add(endplateR);

  // 6. LED Headlight Strips & Grille
  const grilleGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.16, 0.08));
  const grille = new THREE.Mesh(grilleGeo, carbonMat);
  grille.position.set(0, 0.34, 2.24);
  bodyTiltGroup.add(grille);

  const headGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.075, 0.10));
  const headL = new THREE.Mesh(headGeo, headlightMat);
  headL.position.set(0.64, 0.49, 2.18);
  headL.rotation.y = 0.18;
  bodyTiltGroup.add(headL);

  const headR = new THREE.Mesh(headGeo, headlightMat);
  headR.position.set(-0.64, 0.49, 2.18);
  headR.rotation.y = -0.18;
  bodyTiltGroup.add(headR);

  // 7. Reactive Rear Brake Light Bar & Diffuser
  const tailBarGeo = trackGeo(new THREE.BoxGeometry(1.56, 0.08, 0.07));
  const tailBar = new THREE.Mesh(tailBarGeo, brakeLightMat);
  tailBar.position.set(0, 0.65, -2.23);
  bodyTiltGroup.add(tailBar);

  const diffuserGeo = trackGeo(new THREE.BoxGeometry(1.48, 0.16, 0.18));
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.26, -2.18);
  bodyTiltGroup.add(diffuser);

  // 8. Twin Chrome Exhaust Pipes + Nitro Flame Cones
  const pipeGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12));
  pipeGeo.rotateX(Math.PI / 2);
  const pipeL = new THREE.Mesh(pipeGeo, chromeMat);
  pipeL.position.set(0.34, 0.27, -2.26);
  bodyTiltGroup.add(pipeL);

  const pipeR = new THREE.Mesh(pipeGeo, chromeMat);
  pipeR.position.set(-0.34, 0.27, -2.26);
  bodyTiltGroup.add(pipeR);

  const flameGeo = trackGeo(new THREE.ConeGeometry(0.075, 0.65, 10));
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.32);
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(0.34, 0.27, -2.35);
  flameL.visible = false;
  bodyTiltGroup.add(flameL);

  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(-0.34, 0.27, -2.35);
  flameR.visible = false;
  bodyTiltGroup.add(flameR);

  // 9. Four Articulated Wheel Assemblies (bottom touches y = 0)
  const wheelRadius = 0.35;
  const wheelWidth = 0.28;
  const tireGeo = trackGeo(
    new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24),
  );
  tireGeo.rotateZ(Math.PI / 2);

  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, wheelWidth + 0.02, 16));
  rimGeo.rotateZ(Math.PI / 2);

  const spokeGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.03, 0.38, 0.045));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, wheelWidth + 0.04, 12));
  hubGeo.rotateZ(Math.PI / 2);

  const wheelPositions: [number, number, number][] = [
    [0.90, wheelRadius, 1.38],   // FL
    [-0.90, wheelRadius, 1.38],  // FR
    [0.92, wheelRadius, -1.36],  // RL
    [-0.92, wheelRadius, -1.36], // RR
  ];

  const wheels: THREE.Group[] = [];
  const frontSteerPivots: THREE.Group[] = [];

  wheelPositions.forEach(([wx, wy, wz], idx) => {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, wy, wz);
    root.add(steerPivot);
    if (idx < 2) {
      frontSteerPivots.push(steerPivot);
    }

    const wheelSpin = new THREE.Group();
    steerPivot.add(wheelSpin);
    wheels.push(wheelSpin);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    wheelSpin.add(tire);

    const rim = new THREE.Mesh(rimGeo, chromeMat);
    wheelSpin.add(rim);

    // 3-spoke cross pattern so wheel rotation is super legible at all speeds
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, carbonMat);
      spoke.rotation.x = (s * Math.PI) / 3;
      wheelSpin.add(spoke);
    }

    const hub = new THREE.Mesh(hubGeo, accentMat);
    wheelSpin.add(hub);
  });

  // 10. Grounded Radial Contact Shadow Plane
  const shadowPlaneGeo = trackGeo(new THREE.PlaneGeometry(2.8, 5.2));
  shadowPlaneGeo.rotateX(-Math.PI / 2);
  const shadowPlaneMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const contactShadow = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  return {
    root,
    bodyTiltGroup,
    wheels,
    frontSteerPivots,
    brakeLightMat,
    nitroFlames: [flameL, flameR],
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
