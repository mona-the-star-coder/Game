import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltRoughnessMap: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  terrainMap: THREE.CanvasTexture;
  startLineMap: THREE.CanvasTexture;
  gantryBannerMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  skyMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(
  theme: 'day' | 'night',
  maxAnisotropy: number,
): ProceduralTextureSet {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 16));

  // 1. Asphalt Road Texture (albedo + aggregate grain + racing groove + lane dashes)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;

  actx.fillStyle = theme === 'day' ? '#272B33' : '#181C24';
  actx.fillRect(0, 0, 512, 512);

  // Subtle aggregate speckle
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = theme === 'day' ? 32 + Math.random() * 28 : 20 + Math.random() * 24;
    actx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    actx.fillRect(x, y, 2, 2);
  }

  // Dark tire rubber racing grooves
  const grooveLeft = actx.createLinearGradient(110, 0, 210, 0);
  grooveLeft.addColorStop(0, 'rgba(10,12,16,0)');
  grooveLeft.addColorStop(0.5, 'rgba(10,12,16,0.32)');
  grooveLeft.addColorStop(1, 'rgba(10,12,16,0)');
  actx.fillStyle = grooveLeft;
  actx.fillRect(110, 0, 100, 512);

  const grooveRight = actx.createLinearGradient(302, 0, 402, 0);
  grooveRight.addColorStop(0, 'rgba(10,12,16,0)');
  grooveRight.addColorStop(0.5, 'rgba(10,12,16,0.32)');
  grooveRight.addColorStop(1, 'rgba(10,12,16,0)');
  actx.fillStyle = grooveRight;
  actx.fillRect(302, 0, 100, 512);

  // Crisp white edge lines
  actx.fillStyle = theme === 'day' ? '#E2E8F0' : '#CBD5E1';
  actx.fillRect(14, 0, 10, 512);
  actx.fillRect(488, 0, 10, 512);

  // Dashed center line
  actx.fillStyle = theme === 'day' ? 'rgba(241, 245, 249, 0.55)' : 'rgba(245, 158, 11, 0.6)';
  for (let y = 16; y < 512; y += 128) {
    actx.fillRect(252, y, 8, 64);
  }

  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = anisotropy;

  // 2. Asphalt Roughness Map (slightly glossier tire tracks on night circuit)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = theme === 'day' ? '#DCDCDC' : '#8A8A8A';
  rctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = theme === 'day' ? 180 + Math.random() * 60 : 95 + Math.random() * 75;
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const asphaltRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughnessMap.wrapS = THREE.RepeatWrapping;
  asphaltRoughnessMap.wrapT = THREE.RepeatWrapping;
  asphaltRoughnessMap.anisotropy = anisotropy;

  // 3. FIA Rumble Curb Texture
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 128;
  curbCanvas.height = 256;
  const cctx = curbCanvas.getContext('2d')!;
  cctx.fillStyle = theme === 'day' ? '#DC2626' : '#F59E0B';
  cctx.fillRect(0, 0, 128, 128);
  cctx.fillStyle = theme === 'day' ? '#F8FAFC' : '#1E293B';
  cctx.fillRect(0, 128, 128, 128);
  // Subtle concrete seam
  cctx.fillStyle = 'rgba(0,0,0,0.22)';
  cctx.fillRect(0, 126, 128, 4);
  cctx.fillRect(0, 252, 128, 4);

  const curbMap = new THREE.CanvasTexture(curbCanvas);
  curbMap.colorSpace = THREE.SRGBColorSpace;
  curbMap.wrapS = THREE.RepeatWrapping;
  curbMap.wrapT = THREE.RepeatWrapping;
  curbMap.anisotropy = anisotropy;

  // 4. Ground Terrain Texture
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = 512;
  terrainCanvas.height = 512;
  const tctx = terrainCanvas.getContext('2d')!;
  tctx.fillStyle = theme === 'day' ? '#365832' : '#121824';
  tctx.fillRect(0, 0, 512, 512);

  // Subtle alternating turf bands or industrial concrete tiles
  tctx.fillStyle = theme === 'day' ? 'rgba(72, 110, 60, 0.28)' : 'rgba(30, 41, 59, 0.35)';
  for (let i = 0; i < 512; i += 64) {
    tctx.fillRect(i, 0, 32, 512);
  }
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    tctx.fillStyle =
      theme === 'day'
        ? Math.random() > 0.5
          ? 'rgba(34, 60, 30, 0.35)'
          : 'rgba(110, 138, 82, 0.25)'
        : 'rgba(15, 23, 42, 0.4)';
    tctx.fillRect(x, y, 3, 3);
  }
  const terrainMap = new THREE.CanvasTexture(terrainCanvas);
  terrainMap.colorSpace = THREE.SRGBColorSpace;
  terrainMap.wrapS = THREE.RepeatWrapping;
  terrainMap.wrapT = THREE.RepeatWrapping;
  terrainMap.repeat.set(80, 80);
  terrainMap.anisotropy = anisotropy;

  // 5. Start/Finish Checkered Line
  const startCanvas = document.createElement('canvas');
  startCanvas.width = 512;
  startCanvas.height = 128;
  const sctx = startCanvas.getContext('2d')!;
  const cell = 32;
  for (let y = 0; y < 128; y += cell) {
    for (let x = 0; x < 512; x += cell) {
      const even = ((x / cell) + (y / cell)) % 2 === 0;
      sctx.fillStyle = even ? '#F8FAFC' : '#0F172A';
      sctx.fillRect(x, y, cell, cell);
    }
  }
  const startLineMap = new THREE.CanvasTexture(startCanvas);
  startLineMap.colorSpace = THREE.SRGBColorSpace;
  startLineMap.anisotropy = anisotropy;

  // 6. Gantry Banner Texture
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024;
  bannerCanvas.height = 160;
  const bctx = bannerCanvas.getContext('2d')!;
  bctx.fillStyle = '#0F172A';
  bctx.fillRect(0, 0, 1024, 160);
  bctx.fillStyle = '#DC2626';
  bctx.fillRect(0, 0, 1024, 14);
  bctx.fillRect(0, 146, 1024, 14);
  bctx.fillStyle = '#F8FAFC';
  bctx.font = 'bold 62px "Chakra Petch", sans-serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('APEX CIRCUIT GRAND PRIX', 512, 82);

  const gantryBannerMap = new THREE.CanvasTexture(bannerCanvas);
  gantryBannerMap.colorSpace = THREE.SRGBColorSpace;
  gantryBannerMap.anisotropy = anisotropy;

  // 7. Radial Soft Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shctx = shadowCanvas.getContext('2d')!;
  const radGrad = shctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  radGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shctx.fillStyle = radGrad;
  shctx.fillRect(0, 0, 256, 256);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);

  // 8. Atmospheric Sky Dome Gradient
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d')!;
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
  if (theme === 'day') {
    skyGrad.addColorStop(0, '#1D4ED8');
    skyGrad.addColorStop(0.38, '#3B82F6');
    skyGrad.addColorStop(0.54, '#93C5FD');
    skyGrad.addColorStop(0.66, '#FDE68A');
    skyGrad.addColorStop(0.75, '#D9E2EC');
    skyGrad.addColorStop(1, '#365832');
  } else {
    skyGrad.addColorStop(0, '#04070D');
    skyGrad.addColorStop(0.42, '#0B1324');
    skyGrad.addColorStop(0.62, '#17253B');
    skyGrad.addColorStop(0.74, '#1E293B');
    skyGrad.addColorStop(1, '#0F172A');
  }
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 64, 512);
  const skyMap = new THREE.CanvasTexture(skyCanvas);
  skyMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltRoughnessMap,
    curbMap,
    terrainMap,
    startLineMap,
    gantryBannerMap,
    contactShadowMap,
    skyMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltRoughnessMap.dispose();
      curbMap.dispose();
      terrainMap.dispose();
      startLineMap.dispose();
      gantryBannerMap.dispose();
      contactShadowMap.dispose();
      skyMap.dispose();
    },
  };
}
