import { useEffect, useRef } from 'react';
import { HEAT_WARN } from '@/game/phi/neonFloor';

interface Props {
  /** 0..1 heat level. */
  heat: number;
  /** Vertical label next to the bar. */
  label?: string;
  /** Warning banner shown in the red zone. */
  warning?: string;
  /** Locked (overheated) styling. */
  locked?: boolean;
}

/** Short alarm beep used when the core enters the red zone. */
function playAlarm() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, ctx.currentTime);
    o.frequency.setValueAtTime(760, ctx.currentTime + 0.14);
    o.frequency.setValueAtTime(1200, ctx.currentTime + 0.28);
    g.gain.setValueAtTime(0.16, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.46);
  } catch {}
}

function heatColor(h: number) {
  if (h < 0.4) return '#3ee07a';
  if (h < 0.6) return '#ffe14d';
  if (h < HEAT_WARN) return '#ff9d3c';
  return '#ff3b47';
}

export default function NeonHeatMeter({ heat, label = 'SYSTEM HEAT', warning = '⚠ SYSTEM OVERLOAD — STOP EMITTING', locked = false }: Props) {
  const clamped = Math.max(0, Math.min(1, heat));
  const danger = locked || clamped >= HEAT_WARN;
  const lastAlarm = useRef(0);

  useEffect(() => {
    if (!danger) return;
    const now = performance.now();
    if (now - lastAlarm.current < 900) return;
    lastAlarm.current = now;
    playAlarm();
  }, [danger, clamped]);

  return (
    <div className="fixed left-2 top-1/2 -translate-y-1/2 z-40 pointer-events-none flex items-center gap-2">
      <div
        className="rounded-lg border-2 overflow-hidden flex flex-col justify-end"
        style={{
          width: 26,
          height: 'clamp(140px, 26vh, 230px)',
          borderColor: danger ? '#ff3b47' : '#00e5ff88',
          background: 'rgba(0,0,0,0.65)',
          boxShadow: danger ? '0 0 22px #ff3b47' : '0 0 12px #00e5ff55',
        }}
      >
        <div
          style={{
            height: `${clamped * 100}%`,
            background: `linear-gradient(to top, #3ee07a, ${heatColor(clamped)})`,
            transition: 'height 80ms linear',
          }}
        />
      </div>
      <div className="font-mono text-[10px] tracking-widest" style={{ color: heatColor(clamped) }}>
        <div style={{ writingMode: 'vertical-rl' }}>{label}</div>
      </div>
      {danger && (
        <div
          className="px-3 py-2 rounded-lg border-2 font-mono font-bold text-[clamp(10px,1.3vw,14px)] tracking-widest animate-pulse"
          style={{ borderColor: '#ff3b47', color: '#ff6b74', background: 'rgba(40,0,0,0.8)' }}
        >
          {warning}
        </div>
      )}
    </div>
  );
}
