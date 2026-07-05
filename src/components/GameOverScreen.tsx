import { GameState, TEAM_COLORS, TEAM_NAMES, TeamIndex } from '@/game/types';

interface Props {
  state: GameState;
  onRestart: () => void;
}

export default function GameOverScreen({ state, onRestart }: Props) {
  // PHI Castle result
  if (state.mode === 'phi') {
    const phi = state.phi;
    const isSurvivor = !!phi?.survivorMode;
    if (isSurvivor) {
      const score = phi?.floorsSurvived ?? 0;
      const best = phi?.survivorBest ?? 0;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
            <h1 className="text-3xl font-bold font-mono tracking-wider text-primary">SURVIVOR RUN ENDED</h1>
            <div className="text-xl font-mono text-white">Floors Survived: <span className="text-primary font-bold">{score}</span></div>
            <div className="text-lg font-mono text-muted-foreground">Highest Record: <span className="text-amber-300 font-bold">{best}</span></div>
            <button onClick={onRestart} className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90">PLAY AGAIN</button>
          </div>
        </div>
      );
    }
    const result = phi?.result;
    const isTie = result === 'draw' || !result;
    const winnerName = phi?.winnerName ?? '';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
          <h1 className="text-3xl md:text-4xl font-bold font-mono tracking-wider text-primary">
            {isTie ? "It's a Tie." : `${winnerName} won for now!`}
          </h1>
          <div className="text-sm text-muted-foreground font-mono">
            Floors cleared: {(phi?.currentFloorIdx ?? 0) + 1} / {phi?.floorSequence.length ?? 0}
          </div>
          <button
            onClick={onRestart}
            className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >PLAY AGAIN</button>
        </div>
      </div>
    );
  }

  // Football mode result
  if (state.mode === 'football') {
    const score = state.score || { red: 0, blue: 0 };
    const winner = score.red > score.blue ? 'RED' : score.red < score.blue ? 'BLUE' : 'DRAW';
    const color = winner === 'RED' ? '#e03030' : winner === 'BLUE' ? '#4a90d9' : '#888';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
          <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color }}>
            {winner === 'DRAW' ? '🤝 IT\'S A DRAW!' : `🏆 ${winner} TEAM WINS!`}
          </h1>
          <p className="text-2xl font-mono font-bold">
            <span style={{ color: '#e03030' }}>RED {score.red}</span>
            <span className="text-white mx-3">—</span>
            <span style={{ color: '#4a90d9' }}>{score.blue} BLUE</span>
          </p>
          <div className="text-sm text-muted-foreground font-mono">
            Time: {Math.floor(state.timeElapsed / 1000)}s · Rounds: {state.totalRounds}
          </div>
          <button
            onClick={onRestart}
            className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    );
  }

  const winner = state.winner as TeamIndex | null;
  const team = winner ?? 0;
  const color = winner !== null ? TEAM_COLORS[team] : '#888';
  const teamName = winner !== null ? TEAM_NAMES[team] : '—';
  const ability = winner !== null ? state.teamAbilities[team] : '';
  const objectiveText: Record<string, string> = {
    crew: 'Completed all assigned tasks!',
    kill: 'Eliminated every enemy player!',
    shooter: 'Shot down every enemy player!',
    jail: 'All enemies are jailed or down!',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
        <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color }}>
          🏆 {teamName} TEAM WINS!
        </h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Ability: {ability}
        </p>
        <p className="text-muted-foreground font-mono">
          {objectiveText[ability] || 'Objective achieved.'}
        </p>
        <div className="text-sm text-muted-foreground font-mono">
          Time: {Math.floor(state.timeElapsed / 1000)}s |
          Survivors: {state.players.filter(p => p.alive).length}/{state.players.length}
        </div>
        <button
          onClick={onRestart}
          className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
