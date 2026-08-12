import { GameState, TEAM_COLORS, TEAM_NAMES, TeamIndex } from '@/game/types';
import { computeRankings } from '@/game/phi/match';

interface Props {
  state: GameState;
  onRestart: () => void;
}

const PLACE_STYLE: Record<number, { color: string; label: string }> = {
  1: { color: '#f2c94c', label: 'YOU ARE 1st' },
  2: { color: '#cfd6e0', label: 'YOU ARE 2nd' },
  3: { color: '#c08457', label: 'YOU ARE 3rd' },
};

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
    const rows = computeRankings(state);
    const you = rows.find(r => r.isHuman);
    const place = you?.rank ?? rows.length;
    const style = PLACE_STYLE[place] ?? { color: '#ef4444', label: 'GAME OVER' };
    const winnerName = phi?.winnerName ?? rows[0]?.name ?? '—';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/92 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card shadow-2xl overflow-hidden font-mono">
          <div className="text-center px-6 pt-7 pb-4">
            <div className="text-[11px] tracking-[0.35em] text-white/40">FINAL RESULT</div>
            <h1
              className="text-[clamp(26px,6vw,40px)] font-bold tracking-wider mt-1"
              style={{ color: style.color }}
            >
              {style.label}
            </h1>
            <div className="text-xs text-muted-foreground mt-1">
              Floors played: {phi?.floorSequence.length ?? 0} · Your qualified floors: {you?.qualified ?? 0}
            </div>
          </div>

          <div className="max-h-[42vh] overflow-y-auto border-y border-white/10">
            <div className="grid grid-cols-[28px_1fr_44px_44px] gap-1 px-4 py-2 text-[9px] uppercase tracking-wider text-white/40">
              <span>#</span><span>Player</span><span className="text-right">Qual</span><span className="text-right">Dead</span>
            </div>
            {rows.map(r => (
              <div
                key={r.id}
                className={`grid grid-cols-[28px_1fr_44px_44px] gap-1 px-4 py-1.5 text-[12px] items-center border-t border-white/5 ${
                  r.isHuman ? 'bg-amber-300/10' : ''
                }`}
              >
                <span className="font-bold" style={{ color: PLACE_STYLE[r.rank]?.color ?? 'rgba(255,255,255,0.5)' }}>
                  {r.rank}
                </span>
                <span className="truncate text-white/85">
                  {r.name}{r.isHuman && <span className="ml-1 text-[9px] text-amber-200 font-bold">YOU</span>}
                </span>
                <span className="text-right text-emerald-300/90">{r.qualified}</span>
                <span className="text-right text-red-300/80">{r.died}</span>
              </div>
            ))}
          </div>

          <div className="px-6 py-4 space-y-3 text-center">
            <div className="text-sm">
              <span className="text-white/50">Winner: </span>
              <span className="font-bold" style={{ color: '#f2c94c' }}>{winnerName}</span>
            </div>
            <button
              onClick={onRestart}
              className="w-full py-3 rounded-lg font-bold text-base bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >PLAY AGAIN</button>
          </div>
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
