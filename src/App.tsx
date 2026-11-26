import { useCallback, useEffect, useRef, useState } from 'react';
import { GarageMenu } from './components/GarageMenu';
import { PodiumOverlay } from './components/PodiumOverlay';
import { RaceHud } from './components/RaceHud';
import { RacingEngine } from './game/RacingEngine';
import {
  CameraMode,
  CAR_SPECS,
  CIRCUIT_SPECS,
  CircuitId,
  Difficulty,
  GamePhase,
  InputState,
  RaceTelemetry,
} from './game/types';

const STORAGE_KEY = 'apex_circuit_best_laps_v1';

const INITIAL_TELEMETRY: RaceTelemetry = {
  speedKmh: 0,
  rpmRatio: 0.16,
  gear: 1,
  nitro: 65,
  isBoosting: false,
  isDrifting: false,
  offTrack: false,
  wrongWay: false,
  position: 6,
  totalCars: 6,
  lap: 1,
  totalLaps: 3,
  currentLapMs: 0,
  bestLapMs: null,
  lastLapMs: null,
  raceTimeMs: 0,
  countdownValue: 3,
  standings: [],
  minimapMarkers: [],
};

const CAMERA_CYCLE: CameraMode[] = ['chase', 'far', 'hood', 'bumper'];

function loadBestRecords(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('menu');
  const [selectedCarId, setSelectedCarId] = useState<string>(CAR_SPECS[0].id);
  const [selectedCircuitId, setSelectedCircuitId] = useState<CircuitId>('coastal');
  const [difficulty, setDifficulty] = useState<Difficulty>('pro');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [muted, setMuted] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [touchControlsVisible, setTouchControlsVisible] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
  );
  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [minimapPath, setMinimapPath] = useState('');
  const [bestRecords, setBestRecords] = useState<Record<string, number>>(loadBestRecords);
  const [isNewBestRecord, setIsNewBestRecord] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const phaseRef = useRef<GamePhase>('menu');
  const circuitIdRef = useRef<CircuitId>('coastal');
  const bestRecordsRef = useRef<Record<string, number>>(bestRecords);

  phaseRef.current = phase;
  circuitIdRef.current = selectedCircuitId;
  bestRecordsRef.current = bestRecords;

  // Initialize Three.js RacingEngine once in isolated canvas container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new RacingEngine(mountEl, {
      onTelemetry: (snap) => {
        setTelemetry(snap);
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
        setMinimapPath(engine.getMinimapPath());
      },
      onContextLost: (lost) => {
        setWebglError(
          lost ? 'Graphics context paused. Restoring 3D viewport...' : null,
        );
      },
      onWebGLUnsupported: () => {
        setWebglError('WebGL graphics acceleration is unavailable in this browser.');
      },
    });

    const mounted = engine.mount();
    if (mounted) {
      engineRef.current = engine;
      setMinimapPath(engine.getMinimapPath());
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Save new best lap record when race finishes
  useEffect(() => {
    if (phase === 'finished' && telemetry.bestLapMs !== null) {
      const cid = circuitIdRef.current;
      const prevBest = bestRecordsRef.current[cid];
      if (!prevBest || telemetry.bestLapMs < prevBest) {
        const updated = { ...bestRecordsRef.current, [cid]: telemetry.bestLapMs };
        setBestRecords(updated);
        setIsNewBestRecord(true);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage quota errors
        }
      }
    }
  }, [phase, telemetry.bestLapMs]);

  const handleSelectCar = useCallback(
    (carId: string) => {
      setSelectedCarId(carId);
      engineRef.current?.configureSession(carId, selectedCircuitId, difficulty);
    },
    [selectedCircuitId, difficulty],
  );

  const handleSelectCircuit = useCallback(
    (circuitId: CircuitId) => {
      setSelectedCircuitId(circuitId);
      engineRef.current?.configureSession(selectedCarId, circuitId, difficulty);
      if (engineRef.current) {
        setMinimapPath(engineRef.current.getMinimapPath());
      }
    },
    [selectedCarId, difficulty],
  );

  const handleSelectDifficulty = useCallback(
    (diff: Difficulty) => {
      setDifficulty(diff);
      engineRef.current?.configureSession(selectedCarId, selectedCircuitId, diff);
    },
    [selectedCarId, selectedCircuitId],
  );

  const handleStartRace = useCallback(() => {
    setIsNewBestRecord(false);
    engineRef.current?.configureSession(selectedCarId, selectedCircuitId, difficulty);
    engineRef.current?.startRace();
    if (engineRef.current) {
      setMinimapPath(engineRef.current.getMinimapPath());
    }
  }, [selectedCarId, selectedCircuitId, difficulty]);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleExitToMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
  }, []);

  const handleResetCar = useCallback(() => {
    engineRef.current?.resetPlayerToTrack();
  }, []);

  const handleCameraChange = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    engineRef.current?.setCameraMode(mode);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleInputChange = useCallback((partial: Partial<InputState>) => {
    engineRef.current?.setInput(partial);
  }, []);

  // Global keyboard controls
  useEffect(() => {
    const mapKey = (code: string, pressed: boolean) => {
      const eng = engineRef.current;
      if (!eng) return;

      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          eng.setInput({ throttle: pressed });
          break;
        case 'KeyS':
        case 'ArrowDown':
          eng.setInput({ brake: pressed });
          break;
        case 'KeyA':
        case 'ArrowLeft':
          eng.setInput({ left: pressed });
          break;
        case 'KeyD':
        case 'ArrowRight':
          eng.setInput({ right: pressed });
          break;
        case 'Space':
          eng.setInput({ drift: pressed });
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyN':
          eng.setInput({ boost: pressed });
          break;
        default:
          break;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      mapKey(e.code, true);

      if (e.repeat) return;

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phaseRef.current === 'racing' || phaseRef.current === 'paused') {
          engineRef.current?.togglePause();
        }
      } else if (e.code === 'KeyC' && phaseRef.current !== 'menu') {
        setCameraMode((prev) => {
          const idx = CAMERA_CYCLE.indexOf(prev);
          const next = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length];
          engineRef.current?.setCameraMode(next);
          return next;
        });
      } else if (e.code === 'KeyR' && phaseRef.current === 'racing') {
        engineRef.current?.resetPlayerToTrack();
      } else if (e.code === 'KeyH' && phaseRef.current !== 'menu') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyM') {
        setMuted((prev) => {
          const next = !prev;
          engineRef.current?.setMuted(next);
          return next;
        });
      } else if (e.code === 'Enter' && phaseRef.current === 'menu') {
        handleStartRace();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      mapKey(e.code, false);
    };

    const onBlur = () => {
      engineRef.current?.setInput({
        throttle: false,
        brake: false,
        left: false,
        right: false,
        drift: false,
        boost: false,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleStartRace]);

  const currentCircuit =
    CIRCUIT_SPECS.find((c) => c.id === selectedCircuitId) || CIRCUIT_SPECS[0];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0B0E14]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Graceful WebGL Fallback */}
      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0E14]/95 p-6 text-center">
          <div className="max-w-md rounded-xl border border-white/15 bg-[#121824] p-6">
            <h2 className="font-display text-xl font-bold text-white">
              3D Viewport Unavailable
            </h2>
            <p className="mt-2 text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {/* Pre-Race Garage & Circuit Selection */}
      {phase === 'menu' && (
        <GarageMenu
          selectedCarId={selectedCarId}
          selectedCircuitId={selectedCircuitId}
          difficulty={difficulty}
          bestRecords={bestRecords}
          muted={muted}
          onSelectCar={handleSelectCar}
          onSelectCircuit={handleSelectCircuit}
          onSelectDifficulty={handleSelectDifficulty}
          onToggleMute={handleToggleMute}
          onStartRace={handleStartRace}
        />
      )}

      {/* Active Race & Countdown HUD */}
      {(phase === 'countdown' || phase === 'racing' || phase === 'paused') && (
        <RaceHud
          phase={phase}
          telemetry={telemetry}
          minimapPath={minimapPath}
          cameraMode={cameraMode}
          muted={muted}
          dockCollapsed={dockCollapsed}
          touchControlsVisible={touchControlsVisible}
          onCameraChange={handleCameraChange}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onResetCar={handleResetCar}
          onRestartRace={handleStartRace}
          onExitToMenu={handleExitToMenu}
          onToggleDock={() => setDockCollapsed((prev) => !prev)}
          onToggleTouchControls={() => setTouchControlsVisible((prev) => !prev)}
          onInputChange={handleInputChange}
        />
      )}

      {/* Post-Race Results Podium */}
      {phase === 'finished' && (
        <PodiumOverlay
          telemetry={telemetry}
          circuit={currentCircuit}
          isNewBestRecord={isNewBestRecord}
          onRaceAgain={handleStartRace}
          onBackToGarage={handleExitToMenu}
        />
      )}
    </main>
  );
}
