import { useEffect, useState } from 'react';
import { GameState } from '@/game/types';

interface Props {
  state: GameState;
  onLeave: () => void;
  onSpectate: () => void;
}

/** Shows a one-time "you died" prompt for the human when they get eliminated. */
export default function DeathModal({ state, onLeave, onSpectate }: Props) {
  const human = state.players[0];
  const [dismissed, setDismissed] = useState(false);
  const [prevEliminated, setPrevEliminated] = useState(false);

  useEffect(() => {
    if (human.phiEliminated && !prevEliminated) setDismissed(false);
    setPrevEliminated(!!human.phiEliminated);
  }, [human.phiEliminated, prevEliminated]);

  if (!human.phiEliminated || dismissed || state.phase !== 'playing') return null;
  if (human.phiSpectator) return null;

  const floor = state.phi?.floorSequence[state.phi.currentFloorIdx] ?? '';
  const label = floor === 'mars' ? 'Floor 1' : floor === 'nucleus' ? 'Floor 2' : 'Floor 3';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-2 border-red-500 rounded-2xl p-8 max-w-sm w-full mx-4 text-center space-y-6 shadow-2xl">
        <h2 className="text-3xl font-mono font-bold text-red-400 tracking-wider">💀 ELIMINATED</h2>
        <p className="text-muted-foreground font-mono">You died on {label}.</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => { setDismissed(true); onSpectate(); }}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-mono font-bold hover:opacity-90"
          >
            SPECTATE
          </button>
          <button
            onClick={() => { setDismissed(true); onLeave(); }}
            className="w-full py-3 rounded-lg border border-white/30 text-white font-mono hover:bg-white/10"
          >
            LEAVE MATCH
          </button>
        </div>
      </div>
    </div>
  );
}
