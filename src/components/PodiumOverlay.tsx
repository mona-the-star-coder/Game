import { RotateCcw, Trophy } from 'lucide-react';
import { formatLapTime, formatOrdinal } from '../game/formatTime';
import { CircuitSpec, RaceTelemetry } from '../game/types';

interface PodiumOverlayProps {
  telemetry: RaceTelemetry;
  circuit: CircuitSpec;
  isNewBestRecord: boolean;
  onRaceAgain: () => void;
  onBackToGarage: () => void;
}

export function PodiumOverlay({
  telemetry,
  circuit,
  isNewBestRecord,
  onRaceAgain,
  onBackToGarage,
}: PodiumOverlayProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0F131C]/96 p-6 md:p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-400">
              {circuit.name} · {circuit.laps} Laps
            </div>
            <h2 className="font-display mt-1 text-3xl font-bold text-white">
              Finished {formatOrdinal(telemetry.position)}
            </h2>
          </div>

          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-400">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-white/10 py-3 text-sm">
          <div>
            <span className="text-slate-400">Total Time: </span>
            <span className="font-mono-tabular font-semibold text-white">
              {formatLapTime(telemetry.raceTimeMs)}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Best Lap: </span>
            <span className="font-mono-tabular font-semibold text-amber-400">
              {formatLapTime(telemetry.bestLapMs)}
            </span>
          </div>
          {isNewBestRecord && (
            <span className="text-xs font-semibold text-emerald-400">
              New Track Record
            </span>
          )}
        </div>

        {/* Standings Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs font-medium text-slate-400">
                <th className="py-2 pr-3">Pos</th>
                <th className="py-2 pr-3">Driver</th>
                <th className="py-2 pr-3">Car</th>
                <th className="py-2 text-right">Best Lap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {telemetry.standings.map((row) => (
                <tr
                  key={row.id}
                  className={row.isPlayer ? 'bg-red-500/12 font-semibold text-white' : 'text-slate-300'}
                >
                  <td className="py-2.5 pr-3 font-mono-tabular">{formatOrdinal(row.position)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-400">{row.carName}</td>
                  <td className="py-2.5 text-right font-mono-tabular text-xs">
                    {formatLapTime(row.bestLapMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onRaceAgain}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-red-500 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Race Again</span>
          </button>
          <button
            type="button"
            onClick={onBackToGarage}
            className="flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.1] whitespace-nowrap shrink-0"
          >
            Change Car or Circuit
          </button>
        </div>
      </div>
    </div>
  );
}
