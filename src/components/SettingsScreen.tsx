import { useState, useEffect } from 'react';
import {
  GameSettings, DEFAULT_SETTINGS, SpeedOption,
  FOOTBALL_SPEED_OPTIONS, FOOTBALL_SPEED_LABELS,
  ROUND_TIME_OPTIONS, ROUND_TIME_LABELS,
} from '@/game/types';

interface Props {
  initial?: GameSettings;
  onBack: () => void;
  onStart: (settings: GameSettings) => void;
}

const SPEED_OPTIONS: SpeedOption[] = ['slow', 'medium', 'fast'];

export default function SettingsScreen({ initial, onBack, onStart }: Props) {
  const [settings, setSettings] = useState<GameSettings>({
    ...(initial ?? DEFAULT_SETTINGS),
    // Ensure a valid mapMode; legacy 'mars' upgrades to 'phi'.
    mapMode: (initial?.mapMode === 'football') ? 'football' : 'phi',
  });

  useEffect(() => {
    try { localStorage.setItem('asteron_settings', JSON.stringify(settings)); }
    catch { /* sandbox */ }
  }, [settings]);

  const isFootball = settings.mapMode === 'football';
  const update = (patch: Partial<GameSettings>) => setSettings(s => ({ ...s, ...patch }));

  const speedWarning = settings.speed === 'fast';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 font-mono">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
          >← Back</button>
          <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-widest">GAME SETTINGS</h1>
          <div className="w-16" />
        </div>

        {/* --- Map Mode --- */}
        <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-3">
          <h2 className="text-primary font-bold text-sm tracking-widest">MAP</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['phi', 'football'] as const).map(m => (
              <button
                key={m}
                onClick={() => update({ mapMode: m })}
                className={`px-3 py-3 rounded text-sm border ${
                  (settings.mapMode ?? 'phi') === m
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-white/20 text-foreground hover:bg-white/5'
                }`}
              >
                {m === 'phi' ? '🏰 PHI Castle' : '⚽ Football Stadium'}
              </button>
            ))}
          </div>
          {!isFootball && (
            <p className="text-[11px] text-muted-foreground">
              PHI Castle · v0.1 — Survive floors in random order. 1 human + local players.
            </p>
          )}
        </section>

        {!isFootball && (
          <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-3">
            <h2 className="text-primary font-bold text-sm tracking-widest">GAME MODE</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['competition', '⚔ Competition', 'Multiplayer with local players.'],
                ['survivor', '🛡 Survivor', 'Solo. Survive endless floors.'],
              ] as const).map(([val, label, desc]) => (
                <button
                  key={val}
                  onClick={() => update({ phiGameMode: val })}
                  className={`px-3 py-3 rounded text-sm border text-left ${
                    (settings.phiGameMode ?? 'competition') === val
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-white/20 text-foreground hover:bg-white/5'
                  }`}
                >
                  <div className="font-bold">{label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* --- Football-only --- */}
        {isFootball && (
          <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-4">
            <h2 className="text-primary font-bold text-sm tracking-widest">FOOTBALL RULES</h2>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">Game Speed</span>
                <span className="text-primary font-bold">
                  {FOOTBALL_SPEED_LABELS[settings.footballSpeed ?? 'medium']}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {FOOTBALL_SPEED_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => update({ footballSpeed: opt })}
                    className={`px-1 py-2 rounded text-[10px] sm:text-xs border leading-tight ${
                      (settings.footballSpeed ?? 'medium') === opt
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >{FOOTBALL_SPEED_LABELS[opt]}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">Round Timer</span>
                <span className="text-primary font-bold">
                  {ROUND_TIME_LABELS[settings.roundTime ?? 120]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ROUND_TIME_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => update({ roundTime: opt })}
                    className={`px-2 py-2 rounded text-xs border ${
                      (settings.roundTime ?? 120) === opt
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >{ROUND_TIME_LABELS[opt]}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-foreground">Match Rounds</div>
              <div className="grid grid-cols-3 gap-2">
                {([3, 5, 10] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => update({ matchRounds: r })}
                    className={`px-2 py-2 rounded text-xs border ${
                      (settings.matchRounds ?? 5) === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >{r} rounds</button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* --- PHI Castle Rules --- */}
        {!isFootball && (
          <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-4">
            <h2 className="text-primary font-bold text-sm tracking-widest">PHI CASTLE</h2>

            {(settings.phiGameMode ?? 'competition') === 'competition' && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">Players (1 human + rest local players)</span>
                  <span className="text-primary font-bold">{settings.playerCount}</span>
                </div>
                <input
                  type="range" min={2} max={15} step={1}
                  value={Math.max(2, Math.min(15, settings.playerCount))}
                  onChange={(e) => update({ playerCount: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>2</span><span>default 10</span><span>15</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-sm text-foreground">Speed</div>
              <div className="grid grid-cols-3 gap-2">
                {SPEED_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => update({ speed: opt })}
                    className={`px-2 py-2 rounded text-xs border capitalize ${
                      settings.speed === opt
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >{opt}</button>
                ))}
              </div>
              {speedWarning && (
                <p className="text-[11px] text-yellow-400 mt-1">
                  ⚠ Fast speed can be intense on weaker devices.
                </p>
              )}
            </div>
          </section>
        )}

        <button
          onClick={() => onStart(settings)}
          className="w-full py-4 rounded-xl font-mono font-bold tracking-widest text-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40"
        >
          START GAME
        </button>
      </div>
    </div>
  );
}
