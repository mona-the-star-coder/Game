export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export type CameraMode = 'chase' | 'far' | 'hood' | 'bumper';

export type Difficulty = 'rookie' | 'pro' | 'master';

export type CircuitId = 'coastal' | 'harbor';

export interface CarSpec {
  id: string;
  name: string;
  classLabel: string;
  color: string;
  accentColor: string;
  topSpeedKmh: number;
  accelRating: number; // 1-10
  gripRating: number; // 1-10
  speedRating: number; // 1-10
  maxSpeed: number; // world units/sec
  acceleration: number;
  handling: number;
  driftGrip: number;
}

export interface CircuitSpec {
  id: CircuitId;
  name: string;
  location: string;
  lengthMeters: number;
  laps: number;
  roadWidth: number;
  theme: 'day' | 'night';
  description: string;
}

export interface DriverStanding {
  id: string;
  name: string;
  carName: string;
  color: string;
  isPlayer: boolean;
  position: number;
  lap: number;
  progress: number; // total race progress (laps + t)
  bestLapMs: number | null;
  totalTimeMs: number | null;
  finished: boolean;
}

export interface MinimapMarker {
  id: string;
  x: number; // normalized 0..100
  y: number; // normalized 0..100
  color: string;
  isPlayer: boolean;
}

export interface RaceTelemetry {
  speedKmh: number;
  rpmRatio: number; // 0..1
  gear: number; // 1..6
  nitro: number; // 0..100
  isBoosting: boolean;
  isDrifting: boolean;
  offTrack: boolean;
  wrongWay: boolean;
  position: number;
  totalCars: number;
  lap: number;
  totalLaps: number;
  currentLapMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  raceTimeMs: number;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  standings: DriverStanding[];
  minimapMarkers: MinimapMarker[];
}

export interface InputState {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  boost: boolean;
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'apex-gtr',
    name: 'Apex GT-R',
    classLabel: 'GT3 Spec',
    color: '#DC2626',
    accentColor: '#F8FAFC',
    topSpeedKmh: 285,
    speedRating: 8,
    accelRating: 8,
    gripRating: 8,
    maxSpeed: 64,
    acceleration: 34,
    handling: 2.35,
    driftGrip: 0.92,
  },
  {
    id: 'valkyrie-rs',
    name: 'Valkyrie RS',
    classLabel: 'Track Aero',
    color: '#2563EB',
    accentColor: '#38BDF8',
    topSpeedKmh: 274,
    speedRating: 7,
    accelRating: 9,
    gripRating: 10,
    maxSpeed: 61.5,
    acceleration: 37,
    handling: 2.65,
    driftGrip: 0.95,
  },
  {
    id: 'solaris-v12',
    name: 'Solaris V12',
    classLabel: 'Hyper Prototype',
    color: '#D97706',
    accentColor: '#FEF3C7',
    topSpeedKmh: 306,
    speedRating: 10,
    accelRating: 7,
    gripRating: 7,
    maxSpeed: 68.5,
    acceleration: 31,
    handling: 2.15,
    driftGrip: 0.89,
  },
];

export const CIRCUIT_SPECS: CircuitSpec[] = [
  {
    id: 'coastal',
    name: 'Coastal Apex Circuit',
    location: 'Pacific Cliffs',
    lengthMeters: 2450,
    laps: 3,
    roadWidth: 16,
    theme: 'day',
    description: 'Fast sweeping coastal turns, elevation crests, and high-speed straights.',
  },
  {
    id: 'harbor',
    name: 'Midnight Harbor GP',
    location: 'Docklands Marina',
    lengthMeters: 2180,
    laps: 3,
    roadWidth: 15,
    theme: 'night',
    description: 'Floodlit technical hairpins and chicane sequences under harbor lights.',
  },
];

export const AI_DRIVERS = [
  { id: 'ai-1', name: 'K. Takahashi', carId: 'valkyrie-rs', color: '#2563EB', accent: '#93C5FD' },
  { id: 'ai-2', name: 'M. Rossi', carId: 'solaris-v12', color: '#D97706', accent: '#FDE68A' },
  { id: 'ai-3', name: 'E. Lindqvist', carId: 'apex-gtr', color: '#059669', accent: '#A7F3D0' },
  { id: 'ai-4', name: 'S. Moreau', carId: 'valkyrie-rs', color: '#7C3AED', accent: '#DDD6FE' },
  { id: 'ai-5', name: 'R. Alvarez', carId: 'solaris-v12', color: '#E11D48', accent: '#FECDD3' },
];
