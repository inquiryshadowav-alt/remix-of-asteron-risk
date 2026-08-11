import { GameState } from '@/game/types';
import { FLOOR_THEME } from '@/game/phi/theme';
import NeonHeatMeter from '@/components/NeonHeatMeter';


interface Props { state: GameState }

const NEON_HEX: Record<string, string> = {
  GREEN: '#5fff8a', WHITE: '#f5f7ff', BLUE: '#57b8ff', RED: '#ff5a6b',
};

export default function PhiHUD({ state }: Props) {
  const phi = state.phi;
  if (!phi) return null;
  const floor = phi.floorSequence[phi.currentFloorIdx];
  const theme = FLOOR_THEME[floor];
  const now = performance.now();
  const timeLeftMs = phi.floorDurationMs > 0
    ? Math.max(0, phi.floorDurationMs - (now - phi.floorStartedAt))
    : null;
  const secs = timeLeftMs !== null ? Math.ceil(timeLeftMs / 1000) : null;

  const alive = state.players.filter(p => !p.phiEliminated).length;
  const qualified = state.players.filter(p => p.phiQualified).length;
  const human = state.players[0];
  const isSpec = human.phiEliminated || human.phiQualified;
  const isSurvivor = !!phi.survivorMode;

  const badgeStyle: React.CSSProperties = {
    background: theme.bgTint,
    borderColor: theme.primary,
    color: theme.primary,
    boxShadow: `0 0 18px ${theme.glow}`,
  };

  const marsProgress = Math.min(3, human.phiTasks ?? 0);
  const totalRemaining = state.taskStations
    ? state.taskStations.filter(s => !s.completed).length
    : 0;

  return (
    <>
      {/* TOP LEFT: floor title + neon freq map */}
      <div className="fixed top-2 left-2 z-40 flex flex-col gap-1 pointer-events-none max-w-[46vw]">
        <div
          className="px-3 py-1.5 rounded-lg border font-mono font-bold text-[clamp(10px,1.3vw,14px)] tracking-widest shadow-lg"
          style={badgeStyle}
        >
          {theme.name} · {isSurvivor ? `WAVE ${phi.currentFloorIdx + 1}` : `${phi.currentFloorIdx + 1}/${phi.floorSequence.length}`}
        </div>
        {floor === 'malteron' && (phi.malteronCountdownUntil ?? 0) > now && (
          <div
            className="px-3 py-1 rounded font-mono text-[clamp(10px,1.2vw,13px)] tracking-wider shadow-lg"
            style={badgeStyle}
          >
            APOCALYPSE IN {Math.max(0, Math.ceil(((phi.malteronCountdownUntil ?? 0) - now) / 1000))}s
          </div>
        )}
        {floor === 'neon' && phi.neon && (
          <div
            className="rounded-lg border p-2 font-mono text-[10px] shadow-lg pointer-events-none"
            style={{ ...badgeStyle, color: '#e6faff' }}
          >
            <div className="tracking-widest mb-1" style={{ color: theme.primary }}>FREQ MAP</div>
            {(['2', '3', '4', '5'] as const).map(k => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-4 text-right">{k}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: NEON_HEX[phi.neon!.mapping[k]] }} />
                <span>{phi.neon!.mapping[k]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOP CENTER: alive / qualified + timer */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 pointer-events-none">
        <div
          className="px-3 py-1 rounded font-mono text-[clamp(10px,1.15vw,12px)] flex gap-3 border"
          style={{ background: 'rgba(0,0,0,0.65)', borderColor: `${theme.primary}55`, color: '#fff' }}
        >
          {secs !== null ? (
            <span className={secs < 10 ? 'text-red-400 font-bold' : ''}>⏱ {secs}s</span>
          ) : (
            <span style={{ color: theme.primary }}>NO TIMER — RACE ON</span>
          )}
          {!isSurvivor && (
            <>
              <span>Alive: {alive}</span>
              <span>Qualified: {qualified}</span>
            </>
          )}
          {isSurvivor && (
            <>
              <span>Floors: {phi.floorsSurvived ?? 0}</span>
              <span>Best: {phi.survivorBest ?? 0}</span>
            </>
          )}
          {floor === 'malteron' && !human.phiEliminated && human.phiBullets !== undefined && (
            <span>Bullets: {human.phiBullets}</span>
          )}
        </div>
        {human.phiQualified && !human.phiEliminated && (
          <div
            className="px-4 py-1.5 rounded border font-mono text-[clamp(11px,1.2vw,13px)] tracking-wider"
            style={{ background: 'rgba(20,90,50,0.7)', borderColor: '#4ade80', color: '#a7f3d0' }}
          >
            ✓ You are qualified.
          </div>
        )}
        {human.phiEliminated && isSpec && (
          <div className="px-3 py-1 rounded bg-yellow-900/60 text-yellow-300 font-mono text-[11px] tracking-wider">
            SPECTATING
          </div>
        )}
      </div>

      {/* LEFT: Neon Overload system heat meter */}
      {floor === 'neon' && !human.phiEliminated && (
        <NeonHeatMeter heat={human.phiHeat ?? 0} />
      )}



      {/* TOP RIGHT: Mars task progress (no overlap) */}
      {floor === 'mars' && !human.phiEliminated && (
        <div className="fixed top-2 right-2 z-40 flex flex-col gap-1 items-end pointer-events-none">
          <div
            className="px-3 py-1.5 rounded-lg border font-mono text-[clamp(10px,1.2vw,13px)] shadow-lg"
            style={badgeStyle}
          >
            {isSurvivor ? `TASKS ${marsProgress}/3` : `QUALIFICATION ${marsProgress}/3`}
          </div>
          {!isSurvivor && (
            <div
              className="px-2 py-1 rounded font-mono text-[10px]"
              style={{ background: 'rgba(0,0,0,0.6)', color: theme.accent }}
            >
              Tasks left: {totalRemaining}
            </div>
          )}
        </div>
      )}

      {phi.banner && now < phi.banner.until && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div
            className="px-8 py-4 rounded-2xl border-2 font-mono font-bold text-[clamp(18px,3.2vw,40px)] tracking-widest text-center shadow-2xl"
            style={{
              background: 'rgba(0,0,0,0.8)',
              borderColor: theme.primary,
              color: theme.primary,
              boxShadow: `0 0 40px ${theme.glow}`,
            }}
          >
            {phi.banner.text}
          </div>
        </div>
      )}
      {phi.floorPhase === 'transition' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 pointer-events-none">
          <div className="text-center space-y-3">
            <div className="text-white font-mono text-[clamp(22px,4vw,52px)] font-bold tracking-widest">
              NEXT FLOOR IN {Math.max(0, Math.ceil((phi.transitionUntil - now) / 1000))}
            </div>
            <div className="font-mono text-lg" style={{ color: theme.primary }}>
              {FLOOR_THEME[phi.floorSequence[phi.currentFloorIdx + 1] ?? floor]?.name ?? '—'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
