import { Flag, Play, Trophy, Volume2, VolumeX } from 'lucide-react';
import { formatLapTime } from '../game/formatTime';
import {
  CAR_SPECS,
  CIRCUIT_SPECS,
  CircuitId,
  Difficulty,
} from '../game/types';

interface GarageMenuProps {
  selectedCarId: string;
  selectedCircuitId: CircuitId;
  difficulty: Difficulty;
  bestRecords: Record<string, number>;
  muted: boolean;
  onSelectCar: (carId: string) => void;
  onSelectCircuit: (circuitId: CircuitId) => void;
  onSelectDifficulty: (diff: Difficulty) => void;
  onToggleMute: () => void;
  onStartRace: () => void;
}

export function GarageMenu({
  selectedCarId,
  selectedCircuitId,
  difficulty,
  bestRecords,
  muted,
  onSelectCar,
  onSelectCircuit,
  onSelectDifficulty,
  onToggleMute,
  onStartRace,
}: GarageMenuProps) {
  const bestLap = bestRecords[selectedCircuitId] ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-7">
      {/* Top-Left Brand + Top-Right Audio Toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto">
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white">
            Apex Circuit
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            3D Grand Prix Championship
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-[#0F131C]/90 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#19202E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 whitespace-nowrap shrink-0"
        >
          {muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-slate-200" />}
          <span>{muted ? 'Muted' : 'Sound On'}</span>
        </button>
      </div>

      {/* Left-Docked Compact Setup Panel (Leaves Center-Right 3D Car Viewport Unobstructed) */}
      <div className="pointer-events-auto my-auto w-full max-w-[410px] rounded-xl border border-white/10 bg-[#0F131C]/92 p-5 shadow-2xl">
        {/* Circuit Selector */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Circuit</span>
            {bestLap !== null && (
              <span className="flex items-center gap-1.5 font-mono-tabular text-amber-400">
                <Trophy className="h-3.5 w-3.5" />
                Best {formatLapTime(bestLap)}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CIRCUIT_SPECS.map((circuit) => {
              const active = circuit.id === selectedCircuitId;
              return (
                <button
                  key={circuit.id}
                  type="button"
                  onClick={() => onSelectCircuit(circuit.id)}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                    active
                      ? 'border-red-500/80 bg-red-500/12 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="text-sm font-semibold leading-tight">{circuit.name}</span>
                  <span className="mt-1 text-xs text-slate-400">
                    {circuit.location} · {circuit.laps} Laps
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Car Selector */}
        <div className="mt-5">
          <div className="text-xs font-medium text-slate-400">Vehicle</div>
          <div className="mt-2 space-y-2">
            {CAR_SPECS.map((car) => {
              const active = car.id === selectedCarId;
              return (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => onSelectCar(car.id)}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                    active
                      ? 'border-red-500/80 bg-red-500/12'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: car.color }}
                      />
                      <span className="text-sm font-semibold text-white">{car.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono-tabular">
                      {car.classLabel} · {car.topSpeedKmh} km/h
                    </span>
                  </div>

                  {active && (
                    <div className="mt-2.5 grid grid-cols-3 gap-3 text-[11px] text-slate-400">
                      <div>
                        <div className="flex justify-between">
                          <span>Speed</span>
                          <span className="font-mono-tabular text-slate-200">{car.speedRating}/10</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${car.speedRating * 10}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span>Accel</span>
                          <span className="font-mono-tabular text-slate-200">{car.accelRating}/10</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${car.accelRating * 10}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span>Grip</span>
                          <span className="font-mono-tabular text-slate-200">{car.gripRating}/10</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${car.gripRating * 10}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Difficulty Segmented Control */}
        <div className="mt-5">
          <div className="text-xs font-medium text-slate-400">AI Competition</div>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1 border border-white/10">
            {(['rookie', 'pro', 'master'] as Difficulty[]).map((diff) => {
              const active = difficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => onSelectDifficulty(diff)}
                  className={`rounded-md py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                    active
                      ? 'bg-white text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {diff}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={onStartRace}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap shrink-0"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>Start Race</span>
        </button>

        {/* Clean Controls Hint */}
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>WASD / Arrows: Drive</span>
          <span aria-hidden="true">·</span>
          <span>Space: Drift</span>
          <span aria-hidden="true">·</span>
          <span>Shift: Nitro</span>
          <span aria-hidden="true">·</span>
          <span>C: Camera</span>
        </div>
      </div>

      {/* Subtle Bottom-Left Track Summary */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-300">
        <Flag className="h-3.5 w-3.5 text-red-500" />
        <span>
          {CIRCUIT_SPECS.find((c) => c.id === selectedCircuitId)?.description}
        </span>
      </div>
    </div>
  );
}
