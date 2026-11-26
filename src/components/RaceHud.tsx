import {
  Camera,
  ChevronDown,
  ChevronUp,
  Flame,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatLapTime, formatOrdinal } from '../game/formatTime';
import { CameraMode, GamePhase, InputState, RaceTelemetry } from '../game/types';

interface RaceHudProps {
  phase: GamePhase;
  telemetry: RaceTelemetry;
  minimapPath: string;
  cameraMode: CameraMode;
  muted: boolean;
  dockCollapsed: boolean;
  touchControlsVisible: boolean;
  onCameraChange: (mode: CameraMode) => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onResetCar: () => void;
  onRestartRace: () => void;
  onExitToMenu: () => void;
  onToggleDock: () => void;
  onToggleTouchControls: () => void;
  onInputChange: (partial: Partial<InputState>) => void;
}

const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'far', label: 'Far' },
  { id: 'hood', label: 'Hood' },
  { id: 'bumper', label: 'Bumper' },
];

export function RaceHud({
  phase,
  telemetry,
  minimapPath,
  cameraMode,
  muted,
  dockCollapsed,
  touchControlsVisible,
  onCameraChange,
  onToggleMute,
  onTogglePause,
  onResetCar,
  onRestartRace,
  onExitToMenu,
  onToggleDock,
  onToggleTouchControls,
  onInputChange,
}: RaceHudProps) {
  const bindTouch = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onInputChange({ [key]: true });
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      onInputChange({ [key]: false });
    },
    onPointerLeave: () => onInputChange({ [key]: false }),
    onPointerCancel: () => onInputChange({ [key]: false }),
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
      {/* Top Row: Position/Lap (Top-Left) & Minimap/Utility (Top-Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Telemetry Block */}
        <div className="pointer-events-auto flex items-stretch gap-4 rounded-xl border border-white/10 bg-[#0B0E14]/88 px-4 py-3">
          <div className="flex flex-col justify-center pr-4 border-r border-white/10">
            <span className="text-[11px] font-medium text-slate-400">Position</span>
            <div className="font-display text-3xl font-bold leading-none text-white tabular-nums mt-0.5">
              {formatOrdinal(telemetry.position)}
              <span className="text-base font-medium text-slate-400"> / {telemetry.totalCars}</span>
            </div>
          </div>

          <div className="flex flex-col justify-center pr-4 border-r border-white/10">
            <span className="text-[11px] font-medium text-slate-400">Lap</span>
            <div className="font-display text-3xl font-bold leading-none text-white tabular-nums mt-0.5">
              {telemetry.lap}
              <span className="text-base font-medium text-slate-400"> / {telemetry.totalLaps}</span>
            </div>
          </div>

          <div className="hidden sm:flex flex-col justify-center space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Lap Time</span>
              <span className="font-mono-tabular font-semibold text-white">
                {formatLapTime(telemetry.currentLapMs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Best Lap</span>
              <span className="font-mono-tabular font-semibold text-amber-400">
                {formatLapTime(telemetry.bestLapMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Minimap & Quick Actions */}
        <div className="pointer-events-auto flex items-start gap-2.5">
          {minimapPath && (
            <div className="hidden sm:block rounded-xl border border-white/10 bg-[#0B0E14]/88 p-2">
              <svg viewBox="0 0 100 100" className="h-24 w-24 overflow-visible">
                <path
                  d={minimapPath}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.35)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {telemetry.minimapMarkers.map((m) => (
                  <circle
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    r={m.isPlayer ? 4.4 : 2.8}
                    fill={m.isPlayer ? '#EF4444' : m.color}
                    stroke={m.isPlayer ? '#FFFFFF' : '#0B0E14'}
                    strokeWidth={m.isPlayer ? 1.5 : 0.8}
                  />
                ))}
              </svg>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={phase === 'paused' ? 'Resume race' : 'Pause race'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0B0E14]/88 text-slate-200 transition-colors hover:bg-[#19202E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              {phase === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0B0E14]/88 text-slate-200 transition-colors hover:bg-[#19202E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              {muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Center Alerts (Countdown / Wrong Way / Off Track) */}
      <div className="flex flex-col items-center justify-center gap-3">
        {phase === 'countdown' && (
          <div className="rounded-2xl border border-white/15 bg-[#0B0E14]/90 px-10 py-5 text-center">
            <div className="text-xs font-medium text-slate-400">Race Start</div>
            <div className="font-display text-6xl md:text-7xl font-bold text-white tabular-nums">
              {telemetry.countdownValue > 0 ? telemetry.countdownValue : 'GO!'}
            </div>
          </div>
        )}

        {phase === 'racing' && telemetry.wrongWay && (
          <div className="rounded-lg border border-red-500/70 bg-red-950/90 px-5 py-2 text-sm font-bold text-red-100">
            Wrong Way — Turn Around
          </div>
        )}

        {phase === 'paused' && (
          <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-white/15 bg-[#0F131C]/95 p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white">Race Paused</h2>
            <p className="mt-1 text-xs text-slate-400">
              Lap {telemetry.lap} of {telemetry.totalLaps} · {formatOrdinal(telemetry.position)} Place
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500"
              >
                Resume Race
              </button>
              <button
                type="button"
                onClick={onRestartRace}
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.1]"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={onExitToMenu}
                className="w-full rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                Return to Garage
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row: Touch Controls (optional) + Collapsible Bottom Dock + Speedometer */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: On-Screen Touch Driving Controls or Subtle Helper */}
        <div className="pointer-events-auto">
          {touchControlsVisible ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Steer Left"
                {...bindTouch('left')}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-[#0B0E14]/90 text-lg font-bold text-white active:bg-red-600"
              >
                L
              </button>
              <button
                type="button"
                aria-label="Steer Right"
                {...bindTouch('right')}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-[#0B0E14]/90 text-lg font-bold text-white active:bg-red-600"
              >
                R
              </button>
            </div>
          ) : (
            <div className="hidden lg:block rounded-lg border border-white/10 bg-[#0B0E14]/82 px-3 py-1.5 text-xs text-slate-400">
              <span>Drive: WASD / Arrows</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span>Drift: Space</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span>Nitro: Shift</span>
            </div>
          )}
        </div>

        {/* Bottom-Center Collapsible Control Dock */}
        <div className="pointer-events-auto hidden md:flex flex-col items-center">
          <button
            type="button"
            onClick={onToggleDock}
            className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/10 bg-[#0B0E14]/90 px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:text-white whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0B0E14]/90 px-3.5 py-2 shadow-xl">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Camera className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
                {CAMERA_MODES.map((m) => {
                  const active = cameraMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onCameraChange(m.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <div className="h-4 w-px bg-white/10" />

              <button
                type="button"
                onClick={onResetCar}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Car</span>
              </button>

              <button
                type="button"
                onClick={onToggleTouchControls}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  touchControlsVisible
                    ? 'bg-red-600/25 text-red-300'
                    : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>On-Screen Pad</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom-Right Speedometer, Gear, RPM & Nitro + Touch Pedals */}
        <div className="pointer-events-auto flex items-end gap-3">
          {touchControlsVisible && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Nitro Boost"
                {...bindTouch('boost')}
                className="flex h-14 w-12 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-950/90 text-xs font-bold text-sky-200 active:bg-sky-600"
              >
                NOS
              </button>
              <button
                type="button"
                aria-label="Brake"
                {...bindTouch('brake')}
                className="flex h-14 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#0B0E14]/90 text-xs font-bold text-slate-200 active:bg-red-700"
              >
                BRK
              </button>
              <button
                type="button"
                aria-label="Throttle"
                {...bindTouch('throttle')}
                className="flex h-16 w-14 items-center justify-center rounded-xl border border-red-500/60 bg-red-600/90 text-xs font-bold text-white active:bg-red-500"
              >
                GAS
              </button>
            </div>
          )}

          <div className="min-w-[195px] rounded-xl border border-white/10 bg-[#0B0E14]/90 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-bold leading-none text-white tabular-nums">
                  {telemetry.speedKmh}
                </span>
                <span className="text-xs font-medium text-slate-400">km/h</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-medium text-slate-400">Gear</span>
                <span className="font-display text-xl font-bold text-amber-400 tabular-nums">
                  {telemetry.gear}
                </span>
              </div>
            </div>

            {/* RPM Segmented Strip */}
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-none ${
                  telemetry.rpmRatio > 0.85 ? 'bg-red-500' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.round(telemetry.rpmRatio * 100)}%` }}
              />
            </div>

            {/* Nitro Boost Gauge */}
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-sky-300">
                <Flame className="h-3 w-3" />
                Nitro {telemetry.isBoosting ? 'Active' : ''}
              </span>
              <span className="font-mono-tabular text-slate-300">{telemetry.nitro}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-sky-400 transition-none"
                style={{ width: `${telemetry.nitro}%` }}
              />
            </div>

            {telemetry.isDrifting && (
              <div className="mt-1.5 text-right text-[11px] font-semibold text-amber-300">
                Drifting · Charging Nitro
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
