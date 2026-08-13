import { useEffect, useState } from 'react';
import { GameState } from '@/game/types';
import { computeRankings } from '@/game/phi/match';

interface Props { state: GameState }

const MEDAL: Record<number, string> = { 1: '#f2c94c', 2: '#cfd6e0', 3: '#c08457' };

/**
 * PHI competition standings. Toggled with the top-right trophy chip or the
 * Shift key on desktop; closes with Shift again or the ✕ button.
 */
export default function RankingBoard({ state }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const phi = state.phi;
  if (!phi || phi.survivorMode) return null;
  const rows = computeRankings(state);
  const you = rows.find(r => r.isHuman);

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Standings"
        className="fixed top-2 right-2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-[11px] font-bold tracking-wider border border-amber-300/40 bg-slate-900/80 text-amber-200 hover:bg-slate-800/90 backdrop-blur-sm shadow"
      >
        <span>🏆</span>
        <span>#{you?.rank ?? '-'}</span>
      </button>

      {open && (
        <div className="fixed top-12 right-2 z-50 w-[min(340px,92vw)] rounded-xl border border-amber-300/25 bg-slate-950/92 backdrop-blur-md shadow-2xl font-mono">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="text-[11px] tracking-widest text-amber-200/90 font-bold">STANDINGS</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/40 hidden sm:inline">SHIFT to toggle</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close standings"
                className="w-6 h-6 rounded border border-white/20 text-white/70 text-xs hover:bg-white/10"
              >✕</button>
            </div>
          </div>
          <div className="max-h-[54vh] overflow-y-auto">
            <div className="grid grid-cols-[28px_1fr_38px_38px_34px] gap-1 px-3 py-1.5 text-[9px] uppercase tracking-wider text-white/40 border-b border-white/5">
              <span>#</span><span>Player</span><span className="text-right">Qual</span><span className="text-right">Dead</span><span className="text-right">HP</span>
            </div>
            {rows.map(r => (
              <div
                key={r.id}
                className={`grid grid-cols-[28px_1fr_38px_38px_34px] gap-1 px-3 py-1.5 text-[11px] items-center border-b border-white/5 ${
                  r.isHuman ? 'bg-amber-300/10' : ''
                }`}
              >
                <span style={{ color: MEDAL[r.rank] ?? 'rgba(255,255,255,0.55)' }} className="font-bold">
                  {r.rank}
                </span>
                <span className="truncate text-white/85">
                  {r.name}
                  {r.isHuman && <span className="ml-1 text-[9px] text-amber-200 font-bold">YOU</span>}
                </span>
                <span className="text-right text-emerald-300/90">{r.qualified}</span>
                <span className="text-right text-red-300/80">{r.died}</span>
                <span className="text-right text-pink-300/90">{r.hearts > 0 ? `+${r.hearts}` : "—"}</span>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 text-[9px] text-white/35">
            Floor {phi.currentFloorIdx + 1} / {phi.floorSequence.length}
          </div>
        </div>
      )}
    </>
  );
}
