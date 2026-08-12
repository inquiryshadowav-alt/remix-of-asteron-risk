import { useState } from 'react';
import { GameState } from '@/game/types';
import { computeRankings } from '@/game/phi/match';

interface Props {
  state: GameState;
  onLeave: () => void;
}

/**
 * Bottom-of-screen death banner for PHI competition. The player keeps
 * watching the action (camera auto-follows the nearest live player) and can
 * quit through a confirmed red button.
 */
export default function DeathOverlay({ state, onLeave }: Props) {
  const [confirming, setConfirming] = useState(false);
  const human = state.players[0];
  const phi = state.phi;
  if (!phi || phi.survivorMode) return null;
  if (!human.phiEliminated || state.phase !== 'playing') return null;

  const watching = phi.spectateId !== undefined
    ? state.players.find(p => p.id === phi.spectateId)
    : undefined;
  const rank = computeRankings(state).find(r => r.id === human.id)?.rank;

  return (
    <>
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="px-4 py-2 rounded-lg border border-red-500/60 bg-black/75 backdrop-blur-sm text-center">
          <div className="font-mono text-[clamp(11px,1.4vw,14px)] text-red-300 font-bold tracking-wide">
            You are dead — try your best in next round!
          </div>
          <div className="font-mono text-[10px] text-white/60 mt-0.5">
            {watching ? `Watching ${watching.name}` : 'Waiting for next floor'}
            {rank ? ` · Your rank #${rank}` : ''}
          </div>
        </div>
      </div>

      <button
        onClick={() => setConfirming(true)}
        className="fixed bottom-3 left-3 z-40 px-3 py-2 rounded-lg font-mono text-xs font-bold tracking-wider bg-red-600/90 text-white border border-red-300/40 hover:bg-red-500 shadow-lg"
      >
        LEAVE MATCH
      </button>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-card border border-red-500/60 rounded-xl p-6 max-w-xs w-full mx-4 text-center space-y-4 shadow-2xl">
            <p className="font-mono text-sm text-foreground">
              Are you sure? You won't be able to play any longer in this match.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onLeave}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-mono font-bold text-sm hover:bg-red-500"
              >YES</button>
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2 rounded-lg border border-white/25 text-foreground font-mono text-sm hover:bg-white/10"
              >NO</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
