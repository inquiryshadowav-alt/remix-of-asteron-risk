import laserUrl from '@/assets/sfx-laser.wav';
import slideUrl from '@/assets/sfx-slide.wav';
import taskWinUrl from '@/assets/sfx-task-win.wav';
import elementUrl from '@/assets/sfx-element.wav';
import bangUrl from '@/assets/sfx-bang.mp3';
import bgmUrl from '@/assets/dragon-chase.mp3';

/** All sound effects are bundled with the build (no CDN dependency). */
export const SFX = {
  laser: laserUrl,
  slide: slideUrl,
  taskWin: taskWinUrl,
  element: elementUrl,
  bang: bangUrl,
} as const;

/** Looping background music track (Electron floor). */
export const BGM_ELECTRON = bgmUrl;

export type SfxName = keyof typeof SFX;

/**
 * Tiny pooled sound-effect player. Game logic (canvas loop) can fire these
 * without touching React. Pools avoid re-decoding on every play and let the
 * same effect overlap with itself.
 */
const POOL_SIZE = 4;
const pools = new Map<string, { nodes: HTMLAudioElement[]; idx: number }>();
let muted = false;

function pool(url: string) {
  let p = pools.get(url);
  if (!p) {
    p = {
      nodes: Array.from({ length: POOL_SIZE }, () => {
        const a = new Audio(url);
        a.preload = 'auto';
        return a;
      }),
      idx: 0,
    };
    pools.set(url, p);
  }
  return p;
}

/** Preload every effect so the first play never stutters. */
export function preloadSfx() {
  for (const url of Object.values(SFX)) pool(url);
}

export function setMuted(v: boolean) { muted = v; }

/**
 * Play a one-shot effect.
 * `maxMs` truncates long samples (the horror sweep is several seconds long).
 */
export function playSfx(name: SfxName, volume = 0.6, maxMs?: number) {
  if (muted) return;
  try {
    const p = pool(SFX[name]);
    const a = p.nodes[p.idx];
    p.idx = (p.idx + 1) % p.nodes.length;
    a.pause();
    a.currentTime = 0;
    a.volume = Math.max(0, Math.min(1, volume));
    const play = a.play();
    if (play) play.catch(() => {});
    if (maxMs) {
      window.setTimeout(() => {
        try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
      }, maxMs);
    }
  } catch { /* audio unavailable */ }
}

/** Throttled variant — ignores calls that arrive within `gapMs` of the last. */
const lastPlayed = new Map<string, number>();
export function playSfxThrottled(name: SfxName, gapMs: number, volume = 0.6, maxMs?: number) {
  const now = performance.now();
  const prev = lastPlayed.get(name) ?? -Infinity;
  if (now - prev < gapMs) return;
  lastPlayed.set(name, now);
  playSfx(name, volume, maxMs);
}

// ---------------- Looping tracks ----------------

const loops = new Map<string, HTMLAudioElement>();

export function startLoop(url: string, volume = 0.35) {
  if (muted) return;
  let a = loops.get(url);
  if (!a) {
    a = new Audio(url);
    a.loop = true;
    a.preload = 'auto';
    loops.set(url, a);
  }
  a.volume = Math.max(0, Math.min(1, volume));
  if (a.paused) a.play().catch(() => {});
}

export function stopLoop(url: string) {
  const a = loops.get(url);
  if (a && !a.paused) { a.pause(); a.currentTime = 0; }
}

export function stopAllLoops() {
  for (const a of loops.values()) { a.pause(); a.currentTime = 0; }
}
