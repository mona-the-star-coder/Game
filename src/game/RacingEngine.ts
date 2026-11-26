import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RaceAudioEngine } from './audio';
import { CarMeshRig, createRaceCarMesh } from './carMesh';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { buildCircuitTrack, BuiltTrack, TrackProjection } from './track';
import {
  AI_DRIVERS,
  CameraMode,
  CAR_SPECS,
  CarSpec,
  CIRCUIT_SPECS,
  CircuitId,
  Difficulty,
  DriverStanding,
  GamePhase,
  InputState,
  MinimapMarker,
  RaceTelemetry,
} from './types';

interface RacerEntity {
  id: string;
  name: string;
  carName: string;
  color: string;
  isPlayer: boolean;
  spec: CarSpec;
  mesh: CarMeshRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  steerAngle: number;
  driftAngle: number;
  isDrifting: boolean;
  isBoosting: boolean;
  nitro: number;
  offTrack: boolean;
  wrongWay: boolean;
  sampleIndex: number;
  trackT: number;
  lap: number;
  maxCheckpointT: number; // prevents lap cheating
  progress: number;
  currentLapStartMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalTimeMs: number | null;
  finished: boolean;
  aiLaneOffset: number;
  aiSkillMult: number;
  aiTargetOffset: number;
  aiOvertakeTimer: number;
}

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

export interface EngineCallbacks {
  onTelemetry: (telemetry: RaceTelemetry) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onContextLost: (lost: boolean) => void;
  onWebGLUnsupported: () => void;
}

// Reusable module-scope math helpers (zero GC inside tick loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _smokeColor = new THREE.Color(0xcbd5e1);
const _nitroColor = new THREE.Color(0x38bdf8);
const _sparkColor = new THREE.Color(0xfbbf24);

const PARTICLE_COUNT = 96;

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;

  private envTexture: THREE.Texture | null = null;
  private textures: ProceduralTextureSet | null = null;
  private track: BuiltTrack | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;

  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleItem[] = [];
  private particleCursor = 0;

  private racers: RacerEntity[] = [];
  private audio = new RaceAudioEngine();
  private input: InputState = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    boost: false,
  };

  private phase: GamePhase = 'menu';
  private selectedCarId = CAR_SPECS[0].id;
  private selectedCircuitId: CircuitId = 'coastal';
  private difficulty: Difficulty = 'pro';
  private cameraMode: CameraMode = 'chase';

  private countdownTimer = 0;
  private lastCountdownBeep = 4;
  private raceElapsedMs = 0;
  private menuOrbitAngle = 0.65;
  private telemetryTimer = 0;

  // Smooth camera state
  private camPos = new THREE.Vector3(0, 6, -15);
  private camLook = new THREE.Vector3(0, 1, 10);
  private camFov = 62;
  private camRoll = 0;

  private projScratch: TrackProjection = {
    t: 0,
    sampleIndex: 0,
    lateralOffset: 0,
    groundY: 0,
    pointX: 0,
    pointZ: 0,
    tangentX: 0,
    tangentZ: 1,
  };

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public mount(): boolean {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      this.callbacks.onWebGLUnsupported();
      return false;
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.scene = new THREE.Scene();
    const aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 1600);

    // Procedural Studio Environment Map for metallic paint & chrome
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    // Three-point outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e4, 2.2);
    this.sunLight.position.set(160, 180, 90);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const d = 140;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 480;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.65);
    this.rimLight.position.set(-120, 65, -140);
    this.scene.add(this.rimLight);

    // Particle InstancedMesh (drift smoke + nitro sparks)
    const pGeo = new THREE.DodecahedronGeometry(0.28, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _smokeColor);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    this.buildWorld(this.selectedCircuitId, this.selectedCarId, this.difficulty);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.clock.start();
    this.tick();
    return true;
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = () => {
    this.callbacks.onContextLost(false);
    this.clock.start();
    this.tick();
  };

  private handleResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  public configureSession(carId: string, circuitId: CircuitId, difficulty: Difficulty): void {
    const circuitChanged = circuitId !== this.selectedCircuitId;
    const carChanged = carId !== this.selectedCarId;
    this.selectedCarId = carId;
    this.selectedCircuitId = circuitId;
    this.difficulty = difficulty;

    if (circuitChanged || carChanged || this.racers.length === 0) {
      this.buildWorld(circuitId, carId, difficulty);
    } else {
      this.updateDifficultyMultipliers(difficulty);
    }
  }

  private updateDifficultyMultipliers(difficulty: Difficulty): void {
    const baseSkill = difficulty === 'rookie' ? 0.78 : difficulty === 'pro' ? 0.90 : 0.99;
    let aiIdx = 0;
    for (const r of this.racers) {
      if (!r.isPlayer) {
        r.aiSkillMult = baseSkill + (aiIdx % 3) * 0.032;
        aiIdx++;
      }
    }
  }

  private buildWorld(circuitId: CircuitId, playerCarId: string, difficulty: Difficulty): void {
    // Cleanup previous track & racers
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }
    if (this.textures) {
      this.textures.dispose();
      this.textures = null;
    }
    for (const r of this.racers) {
      this.scene.remove(r.mesh.root);
      r.mesh.dispose();
    }
    this.racers = [];

    const circuit = CIRCUIT_SPECS.find((c) => c.id === circuitId) || CIRCUIT_SPECS[0];
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(circuit.theme, maxAniso);

    // Update Atmosphere & Lighting
    if (circuit.theme === 'day') {
      const fogColor = new THREE.Color(0xcbd5e1);
      this.scene.background = fogColor;
      this.scene.fog = new THREE.FogExp2(0xcbd5e1, 0.0014);
      if (this.hemiLight) {
        this.hemiLight.color.setHex(0x93c5fd);
        this.hemiLight.groundColor.setHex(0x475569);
        this.hemiLight.intensity = 0.95;
      }
      if (this.sunLight) {
        this.sunLight.color.setHex(0xfff3d6);
        this.sunLight.intensity = 2.2;
      }
      if (this.rimLight) {
        this.rimLight.color.setHex(0x93c5fd);
        this.rimLight.intensity = 0.65;
      }
    } else {
      const fogColor = new THREE.Color(0x0b1220);
      this.scene.background = fogColor;
      this.scene.fog = new THREE.FogExp2(0x0b1220, 0.0022);
      if (this.hemiLight) {
        this.hemiLight.color.setHex(0x38bdf8);
        this.hemiLight.groundColor.setHex(0x0f172a);
        this.hemiLight.intensity = 0.8;
      }
      if (this.sunLight) {
        this.sunLight.color.setHex(0xdbeafe);
        this.sunLight.intensity = 1.65;
      }
      if (this.rimLight) {
        this.rimLight.color.setHex(0xf59e0b);
        this.rimLight.intensity = 0.85;
      }
    }

    this.track = buildCircuitTrack(
      circuitId,
      circuit.roadWidth,
      this.textures,
      !this.isSoftwareGl,
    );
    this.scene.add(this.track.group);

    // Spawn 5 AI drivers ahead on grid (0..4) + Player at P6 (gridIndex 5) for exciting overtakes
    const baseSkill = difficulty === 'rookie' ? 0.78 : difficulty === 'pro' ? 0.90 : 0.99;

    AI_DRIVERS.forEach((ai, idx) => {
      const spec = CAR_SPECS.find((c) => c.id === ai.carId) || CAR_SPECS[0];
      const spawn = this.track!.getSpawnTransform(idx);
      const mesh = createRaceCarMesh(
        ai.color,
        ai.accent,
        this.textures!.contactShadowMap,
        !this.isSoftwareGl,
      );
      mesh.root.position.set(spawn.x, spawn.y, spawn.z);
      mesh.root.rotation.y = spawn.heading;
      this.scene.add(mesh.root);

      this.racers.push({
        id: ai.id,
        name: ai.name,
        carName: spec.name,
        color: ai.color,
        isPlayer: false,
        spec,
        mesh,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        vx: 0,
        vz: 0,
        heading: spawn.heading,
        speed: 0,
        steerAngle: 0,
        driftAngle: 0,
        isDrifting: false,
        isBoosting: false,
        nitro: 50,
        offTrack: false,
        wrongWay: false,
        sampleIndex: spawn.sampleIndex,
        trackT: 0.98,
        lap: 1,
        maxCheckpointT: 0,
        progress: -0.02 - idx * 0.005,
        currentLapStartMs: 0,
        bestLapMs: null,
        lastLapMs: null,
        totalTimeMs: null,
        finished: false,
        aiLaneOffset: (idx % 2 === 0 ? -1 : 1) * (1.8 + (idx % 3) * 0.9),
        aiSkillMult: baseSkill + (idx % 3) * 0.032,
        aiTargetOffset: 0,
        aiOvertakeTimer: 0,
      });
    });

    const playerSpec = CAR_SPECS.find((c) => c.id === playerCarId) || CAR_SPECS[0];
    const pSpawn = this.track.getSpawnTransform(5);
    const pMesh = createRaceCarMesh(
      playerSpec.color,
      playerSpec.accentColor,
      this.textures.contactShadowMap,
      !this.isSoftwareGl,
    );
    pMesh.root.position.set(pSpawn.x, pSpawn.y, pSpawn.z);
    pMesh.root.rotation.y = pSpawn.heading;
    this.scene.add(pMesh.root);

    this.racers.push({
      id: 'player',
      name: 'You',
      carName: playerSpec.name,
      color: playerSpec.color,
      isPlayer: true,
      spec: playerSpec,
      mesh: pMesh,
      x: pSpawn.x,
      y: pSpawn.y,
      z: pSpawn.z,
      vx: 0,
      vz: 0,
      heading: pSpawn.heading,
      speed: 0,
      steerAngle: 0,
      driftAngle: 0,
      isDrifting: false,
      isBoosting: false,
      nitro: 65,
      offTrack: false,
      wrongWay: false,
      sampleIndex: pSpawn.sampleIndex,
      trackT: 0.97,
      lap: 1,
      maxCheckpointT: 0,
      progress: -0.04,
      currentLapStartMs: 0,
      bestLapMs: null,
      lastLapMs: null,
      totalTimeMs: null,
      finished: false,
      aiLaneOffset: 0,
      aiSkillMult: 1,
      aiTargetOffset: 0,
      aiOvertakeTimer: 0,
    });

    // Snap camera immediately for clean initial frame
    this.camPos.set(pSpawn.x - 5.5, pSpawn.y + 2.4, pSpawn.z - 6.5);
    this.camLook.set(pSpawn.x, pSpawn.y + 0.8, pSpawn.z);
    this.emitTelemetry();
  }

  public startRace(): void {
    this.audio.init();
    this.buildWorld(this.selectedCircuitId, this.selectedCarId, this.difficulty);
    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownBeep = 4;
    this.raceElapsedMs = 0;
    this.track?.setStartLightState('red');
    this.callbacks.onPhaseChange('countdown');
    this.emitTelemetry();
  }

  public togglePause(): void {
    if (this.phase === 'racing') {
      this.phase = 'paused';
      this.audio.update(false, 0, false, false, false, 0);
      this.callbacks.onPhaseChange('paused');
    } else if (this.phase === 'paused') {
      this.phase = 'racing';
      this.clock.getDelta();
      this.callbacks.onPhaseChange('racing');
    }
  }

  public returnToMenu(): void {
    this.phase = 'menu';
    this.audio.update(false, 0, false, false, false, 0);
    this.buildWorld(this.selectedCircuitId, this.selectedCarId, this.difficulty);
    this.callbacks.onPhaseChange('menu');
  }

  public resetPlayerToTrack(): void {
    if (!this.track) return;
    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;

    this.track.projectOntoTrack(player.x, player.z, player.sampleIndex, this.projScratch);
    player.x = this.projScratch.pointX;
    player.y = this.projScratch.groundY;
    player.z = this.projScratch.pointZ;
    player.heading = Math.atan2(this.projScratch.tangentX, this.projScratch.tangentZ);
    player.speed = 0;
    player.vx = 0;
    player.vz = 0;
    player.driftAngle = 0;
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setInput(partial: Partial<InputState>): void {
    Object.assign(this.input, partial);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    maxLife: number,
    color: THREE.Color,
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_COUNT;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = 0;
    p.maxLife = maxLife;
    p.scale = scale;
    p.color.copy(color);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);

    if (this.phase === 'menu') {
      this.menuOrbitAngle += dt * 0.28;
      this.updateShowcaseCamera(dt);
    } else if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const ceilVal = Math.max(0, Math.ceil(this.countdownTimer));
      if (ceilVal < this.lastCountdownBeep && ceilVal >= 1 && ceilVal <= 3) {
        this.lastCountdownBeep = ceilVal;
        this.audio.playBeep(false);
        this.track?.setStartLightState(ceilVal === 1 ? 'amber' : 'red');
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.audio.playBeep(true);
        this.track?.setStartLightState('green');
        this.callbacks.onPhaseChange('racing');
      }
      // Subtle revving during countdown
      const player = this.racers.find((r) => r.isPlayer);
      if (player) {
        this.audio.update(
          true,
          this.input.throttle ? 0.55 + Math.sin(this.countdownTimer * 18) * 0.08 : 0.14,
          this.input.throttle,
          false,
          false,
          0,
        );
      }
      this.updateFollowCamera(dt);
    } else if (this.phase === 'racing') {
      this.raceElapsedMs += dt * 1000;
      if (this.raceElapsedMs > 2500) {
        this.track?.setStartLightState('off');
      }
      this.stepSimulation(dt);
      this.updateParticles(dt);
      this.updateFollowCamera(dt);
    } else if (this.phase === 'finished') {
      // Gently coast AI & showcase winner
      this.stepSimulation(dt, true);
      this.updateParticles(dt);
      this.menuOrbitAngle += dt * 0.35;
      this.updateShowcaseCamera(dt);
    }

    // Move sun shadow frustum smoothly with player car so shadows stay crisp
    const player = this.racers.find((r) => r.isPlayer);
    if (player && this.sunLight) {
      this.sunLight.position.set(player.x + 110, player.y + 135, player.z + 75);
      this.sunLight.target.position.set(player.x, player.y, player.z);
    }

    this.renderer.render(this.scene, this.camera);

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.045) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private stepSimulation(dt: number, autopilotPlayer = false): void {
    if (!this.track) return;
    const circuit = CIRCUIT_SPECS.find((c) => c.id === this.selectedCircuitId) || CIRCUIT_SPECS[0];
    const halfW = this.track.roadWidth / 2;

    for (const r of this.racers) {
      if (r.isPlayer && !autopilotPlayer) {
        this.stepPlayerCar(r, dt, halfW);
      } else {
        this.stepAICar(r, dt, halfW);
      }

      // Project onto track for elevation, off-track detection, barriers & lap tracking
      const prevT = r.trackT;
      this.track.projectOntoTrack(r.x, r.z, r.sampleIndex, this.projScratch);

      r.sampleIndex = this.projScratch.sampleIndex;
      r.trackT = this.projScratch.t;
      r.y = THREE.MathUtils.damp(r.y, this.projScratch.groundY, 18, dt);

      const absLat = Math.abs(this.projScratch.lateralOffset);
      r.offTrack = absLat > halfW + 0.85;

      // Barrier containment (clamp within runoff wall + soft bounce)
      const wallLimit = halfW + 3.45;
      if (absLat > wallLimit) {
        const sign = Math.sign(this.projScratch.lateralOffset);
        // Normal points +right, push back toward track center
        const nx = -this.projScratch.tangentZ;
        const nz = this.projScratch.tangentX;
        r.x = this.projScratch.pointX + nx * sign * wallLimit;
        r.z = this.projScratch.pointZ + nz * sign * wallLimit;
        r.speed *= 0.84;

        // Align heading gently along tangent so car slides along wall instead of sticking
        const tanHeading = Math.atan2(this.projScratch.tangentX, this.projScratch.tangentZ);
        let diff = tanHeading - r.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        r.heading += diff * 0.25;

        if (r.isPlayer && Math.abs(r.speed) > 12) {
          this.audio.playCollision(0.45);
          this.spawnParticle(
            r.x,
            r.y + 0.5,
            r.z,
            (Math.random() - 0.5) * 8,
            3 + Math.random() * 4,
            (Math.random() - 0.5) * 8,
            0.7,
            0.28,
            _sparkColor,
          );
        }
      }

      // Wrong-way detection for player
      const fX = Math.sin(r.heading);
      const fZ = Math.cos(r.heading);
      const dotTan = fX * this.projScratch.tangentX + fZ * this.projScratch.tangentZ;
      r.wrongWay = r.speed > 4 && dotTan < -0.35;

      // Checkpoint & Lap Progression
      if (r.trackT > 0.25 && r.trackT < 0.78 && r.trackT > r.maxCheckpointT) {
        r.maxCheckpointT = r.trackT;
      }

      // Crossed finish line forward (from > 0.82 to < 0.18)
      if (prevT > 0.82 && r.trackT < 0.18) {
        if (r.maxCheckpointT > 0.65) {
          const lapDuration = this.raceElapsedMs - r.currentLapStartMs;
          r.lastLapMs = lapDuration;
          if (r.bestLapMs === null || lapDuration < r.bestLapMs) {
            r.bestLapMs = lapDuration;
          }
          r.currentLapStartMs = this.raceElapsedMs;
          r.lap += 1;
          r.maxCheckpointT = 0;

          if (r.isPlayer && r.lap <= circuit.laps) {
            this.audio.playBeep(true);
          }

          if (r.lap > circuit.laps && !r.finished) {
            r.finished = true;
            r.lap = circuit.laps;
            r.totalTimeMs = this.raceElapsedMs;
            if (r.isPlayer) {
              this.phase = 'finished';
              this.audio.update(false, 0, false, false, false, 0);
              this.callbacks.onPhaseChange('finished');
            }
          }
        } else if (r.progress < 0) {
          // Initial launch crossing start line from grid behind line
          r.currentLapStartMs = this.raceElapsedMs;
        }
      }

      // Calculate race progress
      if (r.finished) {
        r.progress = circuit.laps + 1 + (1 / Math.max(1, r.totalTimeMs || this.raceElapsedMs));
      } else if (prevT > 0.82 && r.trackT < 0.18 && r.progress < 0) {
        r.progress = r.trackT;
      } else if (r.progress < 0 && r.trackT > 0.82) {
        r.progress = r.trackT - 1;
      } else {
        r.progress = (r.lap - 1) + r.trackT;
      }

      // Sync visual mesh transforms & wheel rotations
      r.mesh.root.position.set(r.x, r.y, r.z);
      r.mesh.root.rotation.y = r.heading + r.driftAngle;

      // Wheel spin & steering
      const wheelSpinDelta = (r.speed * dt) / 0.35;
      for (const w of r.mesh.wheels) {
        w.rotation.x += wheelSpinDelta;
      }
      for (const pivot of r.mesh.frontSteerPivots) {
        pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, r.steerAngle * 0.42, 16, dt);
      }

      // Nitro flames
      r.mesh.nitroFlames.forEach((flame) => {
        flame.visible = r.isBoosting;
        if (r.isBoosting) {
          flame.scale.set(1, 1, 0.85 + Math.random() * 0.55);
        }
      });
    }

    // Car-to-Car Soft Elastic Collisions
    const minDist = 2.45;
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;
          a.speed *= 0.96;
          b.speed *= 0.96;

          if ((a.isPlayer || b.isPlayer) && Math.abs(a.speed - b.speed) > 4) {
            this.audio.playCollision(0.32);
          }
        }
      }
    }

    // Update Player Audio
    const player = this.racers.find((r) => r.isPlayer);
    if (player && this.phase === 'racing') {
      const speedRatio = Math.min(1, Math.abs(player.speed) / player.spec.maxSpeed);
      const gearFloat = speedRatio * 5.6;
      const gearRpm = 0.22 + (gearFloat % 1) * 0.72;
      this.audio.update(
        true,
        gearRpm,
        this.input.throttle,
        player.isDrifting,
        player.isBoosting,
        speedRatio,
      );
    }
  }

  private stepPlayerCar(r: RacerEntity, dt: number, _halfW: number): void {
    const steerInput = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const wantsBoost = this.input.boost && r.nitro > 4 && this.input.throttle;
    r.isBoosting = wantsBoost;

    if (wantsBoost) {
      r.nitro = Math.max(0, r.nitro - dt * 28);
    } else {
      // Passive slow trickle + faster recharge while drifting
      r.nitro = Math.min(100, r.nitro + dt * (r.isDrifting ? 18 : 2.5));
    }

    const boostMult = wantsBoost ? 1.24 : 1.0;
    const offTrackMult = r.offTrack ? 0.68 : 1.0;
    const maxFwd = r.spec.maxSpeed * boostMult * offTrackMult;
    const maxRev = -18;

    let accel = 0;
    if (this.input.throttle) {
      accel = r.spec.acceleration * (wantsBoost ? 1.45 : 1.0);
    } else if (this.input.brake) {
      accel = r.speed > 1 ? -48 : -22;
    } else {
      // Natural engine braking & rolling resistance
      accel = -r.speed * 0.65;
    }

    // Aero drag
    const drag = r.speed * Math.abs(r.speed) * 0.0042;
    r.speed += (accel - drag) * dt;
    r.speed = THREE.MathUtils.clamp(r.speed, maxRev, maxFwd);

    // Steering & Drift Dynamics
    const speedFactor = THREE.MathUtils.clamp(Math.abs(r.speed) / 14, 0.25, 1.0);
    const reverseSign = r.speed >= -0.5 ? 1 : -1;
    const isDrifting =
      this.input.drift && Math.abs(r.speed) > 18 && Math.abs(steerInput) > 0;
    r.isDrifting = isDrifting;

    const turnRate = r.spec.handling * (isDrifting ? 1.32 : 1.0) * speedFactor * reverseSign;
    r.steerAngle = THREE.MathUtils.damp(r.steerAngle, steerInput * 0.65, 12, dt);
    r.heading += steerInput * turnRate * dt;

    // Visual & slip drift angle
    const targetDrift = isDrifting ? steerInput * 0.28 : steerInput * 0.04 * speedFactor;
    r.driftAngle = THREE.MathUtils.damp(r.driftAngle, targetDrift, 8, dt);

    // Body roll & pitch squat/dive
    const targetRoll = steerInput * 0.065 * speedFactor;
    const targetPitch = this.input.brake && r.speed > 4 ? 0.04 : this.input.throttle ? -0.025 : 0;
    r.mesh.bodyTiltGroup.rotation.z = THREE.MathUtils.damp(
      r.mesh.bodyTiltGroup.rotation.z,
      targetRoll,
      10,
      dt,
    );
    r.mesh.bodyTiltGroup.rotation.x = THREE.MathUtils.damp(
      r.mesh.bodyTiltGroup.rotation.x,
      targetPitch,
      10,
      dt,
    );

    // Reactive brake lights
    r.mesh.brakeLightMat.emissiveIntensity = this.input.brake ? 3.5 : 1.0;

    // Velocity integration
    r.vx = Math.sin(r.heading) * r.speed;
    r.vz = Math.cos(r.heading) * r.speed;
    r.x += r.vx * dt;
    r.z += r.vz * dt;

    // Spawn Drift Tire Smoke & Nitro Exhaust Particles
    if (isDrifting && Math.random() < 0.75) {
      const rearX = r.x - Math.sin(r.heading) * 1.4;
      const rearZ = r.z - Math.cos(r.heading) * 1.4;
      this.spawnParticle(
        rearX + (Math.random() - 0.5) * 1.2,
        r.y + 0.18,
        rearZ + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 2.2,
        0.8 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.2,
        1.1,
        0.45,
        _smokeColor,
      );
    }
    if (wantsBoost && Math.random() < 0.85) {
      const rearX = r.x - Math.sin(r.heading) * 2.4;
      const rearZ = r.z - Math.cos(r.heading) * 2.4;
      this.spawnParticle(
        rearX + (Math.random() - 0.5) * 0.6,
        r.y + 0.28,
        rearZ + (Math.random() - 0.5) * 0.6,
        -r.vx * 0.15 + (Math.random() - 0.5) * 1.5,
        0.3 + Math.random() * 0.8,
        -r.vz * 0.15 + (Math.random() - 0.5) * 1.5,
        0.65,
        0.24,
        _nitroColor,
      );
    }
  }

  private stepAICar(r: RacerEntity, dt: number, halfW: number): void {
    if (!this.track) return;

    // Lookahead along spline curve
    const lookAheadT = (r.trackT + 0.032) % 1;
    const farLookAheadT = (r.trackT + 0.068) % 1;

    this.track.curve.getPointAt(lookAheadT, _vec3A);
    this.track.curve.getTangentAt(lookAheadT, _vec3B);

    // Subtle dynamic lane change to avoid bunching
    r.aiOvertakeTimer -= dt;
    if (r.aiOvertakeTimer <= 0) {
      r.aiOvertakeTimer = 2.5 + Math.random() * 3.5;
      r.aiTargetOffset = (Math.random() - 0.5) * (halfW * 0.95);
    }
    r.aiLaneOffset = THREE.MathUtils.damp(r.aiLaneOffset, r.aiTargetOffset, 1.5, dt);

    const nx = -_vec3B.z;
    const nz = _vec3B.x;
    const targetX = _vec3A.x + nx * r.aiLaneOffset;
    const targetZ = _vec3A.z + nz * r.aiLaneOffset;

    const desiredHeading = Math.atan2(targetX - r.x, targetZ - r.z);
    let headingDiff = desiredHeading - r.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

    const steer = THREE.MathUtils.clamp(headingDiff * 2.2, -1, 1);
    r.steerAngle = THREE.MathUtils.damp(r.steerAngle, steer * 0.55, 10, dt);
    r.heading += steer * r.spec.handling * 1.15 * dt;

    // Corner braking: compare current tangent vs far tangent
    const curTan = this.track.curve.getTangentAt(r.trackT);
    const farTan = this.track.curve.getTangentAt(farLookAheadT);
    const cornerSharpness = 1 - Math.max(0, curTan.dot(farTan));
    const cornerSpeedFactor = THREE.MathUtils.clamp(1 - cornerSharpness * 1.45, 0.52, 1.0);

    // Gentle competitive rubber-banding relative to player
    const player = this.racers.find((p) => p.isPlayer);
    let rubberBand = 1.0;
    if (player && !player.finished && this.phase === 'racing') {
      const gap = player.progress - r.progress;
      if (gap > 0.12) rubberBand = 1.07; // AI catches up slightly if far behind
      else if (gap < -0.18) rubberBand = 0.94; // AI eases slightly if way ahead
    }

    const targetSpeed = r.spec.maxSpeed * r.aiSkillMult * cornerSpeedFactor * rubberBand;
    r.speed = THREE.MathUtils.damp(r.speed, targetSpeed, 2.2, dt);

    r.mesh.brakeLightMat.emissiveIntensity = cornerSpeedFactor < 0.72 ? 2.8 : 0.9;
    r.mesh.bodyTiltGroup.rotation.z = THREE.MathUtils.damp(
      r.mesh.bodyTiltGroup.rotation.z,
      steer * 0.045,
      8,
      dt,
    );

    r.vx = Math.sin(r.heading) * r.speed;
    r.vz = Math.cos(r.heading) * r.speed;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const ratio = 1 - p.life / p.maxLife;
      const s = p.scale * (0.4 + ratio * 0.9);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.life * 3, p.life * 2, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateShowcaseCamera(dt: number): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;

    const radius = 6.8;
    const targetX = player.x + Math.sin(this.menuOrbitAngle) * radius;
    const targetZ = player.z + Math.cos(this.menuOrbitAngle) * radius;
    const targetY = player.y + 2.35;

    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetX, 6, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetY, 6, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetZ, 6, dt);

    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, player.x, 8, dt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, player.y + 0.85, 8, dt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, player.z, 8, dt);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  private updateFollowCamera(dt: number): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;

    const fwdX = Math.sin(player.heading);
    const fwdZ = Math.cos(player.heading);
    const speedRatio = THREE.MathUtils.clamp(Math.abs(player.speed) / player.spec.maxSpeed, 0, 1.25);

    let desiredX = player.x;
    let desiredY = player.y;
    let desiredZ = player.z;
    let lookX = player.x + fwdX * 12;
    let lookY = player.y + 1.1;
    let lookZ = player.z + fwdZ * 12;
    let targetFov = 62 + speedRatio * 10 + (player.isBoosting ? 8 : 0);

    if (this.cameraMode === 'chase') {
      desiredX = player.x - fwdX * 7.2;
      desiredY = player.y + 2.85;
      desiredZ = player.z - fwdZ * 7.2;
    } else if (this.cameraMode === 'far') {
      desiredX = player.x - fwdX * 10.8;
      desiredY = player.y + 4.4;
      desiredZ = player.z - fwdZ * 10.8;
      lookX = player.x + fwdX * 15;
      lookZ = player.z + fwdZ * 15;
    } else if (this.cameraMode === 'hood') {
      desiredX = player.x + fwdX * 0.45;
      desiredY = player.y + 1.38;
      desiredZ = player.z + fwdZ * 0.45;
      lookX = player.x + fwdX * 26;
      lookY = player.y + 1.15;
      lookZ = player.z + fwdZ * 26;
      targetFov = 68 + speedRatio * 10 + (player.isBoosting ? 8 : 0);
    } else {
      // bumper
      desiredX = player.x + fwdX * 2.25;
      desiredY = player.y + 0.72;
      desiredZ = player.z + fwdZ * 2.25;
      lookX = player.x + fwdX * 28;
      lookY = player.y + 0.85;
      lookZ = player.z + fwdZ * 28;
      targetFov = 72 + speedRatio * 10 + (player.isBoosting ? 8 : 0);
    }

    const posDamp = this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 40 : 12;
    const lookDamp = this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 40 : 16;

    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, desiredX, posDamp, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, desiredY, posDamp, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, desiredZ, posDamp, dt);

    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, lookX, lookDamp, dt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, lookY, lookDamp, dt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, lookZ, lookDamp, dt);

    this.camFov = THREE.MathUtils.damp(this.camFov, targetFov, 7, dt);
    this.camRoll = THREE.MathUtils.damp(this.camRoll, -player.steerAngle * 0.035 * speedRatio, 8, dt);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ(this.camRoll);
    this.camera.fov = this.camFov;
    this.camera.updateProjectionMatrix();
  }

  private emitTelemetry(): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player || !this.track) return;

    const circuit = CIRCUIT_SPECS.find((c) => c.id === this.selectedCircuitId) || CIRCUIT_SPECS[0];

    const sorted = [...this.racers].sort((a, b) => b.progress - a.progress);
    const standings: DriverStanding[] = sorted.map((r, idx) => ({
      id: r.id,
      name: r.name,
      carName: r.carName,
      color: r.color,
      isPlayer: r.isPlayer,
      position: idx + 1,
      lap: Math.min(r.lap, circuit.laps),
      progress: r.progress,
      bestLapMs: r.bestLapMs,
      totalTimeMs: r.totalTimeMs,
      finished: r.finished,
    }));

    const playerStanding = standings.find((s) => s.isPlayer);
    const speedRatio = Math.min(1.15, Math.abs(player.speed) / player.spec.maxSpeed);
    const speedKmh = Math.round(speedRatio * player.spec.topSpeedKmh);
    const gearFloat = Math.max(0, speedRatio) * 5.6;
    const gear = Math.min(6, Math.max(1, Math.floor(gearFloat) + 1));
    const rpmRatio = player.speed < 1 ? 0.16 : 0.25 + (gearFloat % 1) * 0.72;

    const minimapMarkers: MinimapMarker[] = this.racers.map((r) => {
      const mc = this.track!.toMinimapCoords(r.x, r.z);
      return {
        id: r.id,
        x: mc.x,
        y: mc.y,
        color: r.color,
        isPlayer: r.isPlayer,
      };
    });

    this.callbacks.onTelemetry({
      speedKmh,
      rpmRatio: Math.min(1, rpmRatio),
      gear,
      nitro: Math.round(player.nitro),
      isBoosting: player.isBoosting,
      isDrifting: player.isDrifting,
      offTrack: player.offTrack,
      wrongWay: player.wrongWay,
      position: playerStanding ? playerStanding.position : 6,
      totalCars: this.racers.length,
      lap: Math.min(player.lap, circuit.laps),
      totalLaps: circuit.laps,
      currentLapMs: this.phase === 'racing' ? Math.max(0, this.raceElapsedMs - player.currentLapStartMs) : 0,
      bestLapMs: player.bestLapMs,
      lastLapMs: player.lastLapMs,
      raceTimeMs: this.raceElapsedMs,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      standings,
      minimapMarkers,
    });
  }

  public getMinimapPath(): string {
    return this.track?.minimapPathD || '';
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
      this.renderer.domElement.remove();
    }

    this.audio.dispose();
    this.track?.dispose();
    this.textures?.dispose();
    this.envTexture?.dispose();
    this.racers.forEach((r) => r.mesh.dispose());
    this.particleMesh?.geometry.dispose();
    if (this.particleMesh && !Array.isArray(this.particleMesh.material)) {
      this.particleMesh.material.dispose();
    }
    this.renderer?.dispose();
  }
}
