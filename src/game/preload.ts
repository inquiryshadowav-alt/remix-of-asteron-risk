import refereeImg from '@/assets/referee.png';
import deadPlayerImg from '@/assets/dead-player.png';
import malteronPng from '@/assets/malteron.png';
import snakeQueenPng from '@/assets/snake-queen.png';
import crewA from '@/assets/char-crew-a.png';
import crewB from '@/assets/char-crew-b.png';
import dragonMp3 from '@/assets/dragon-chase.mp3';

let started = false;
const cache: Record<string, HTMLImageElement> = {};

function loadOne(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cache[src] = img;
      if ('decode' in img) img.decode().catch(() => {}).finally(() => resolve());
      else resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

/** Preload all critical game images so they render instantly when needed. */
export async function preloadGameAssets(): Promise<void> {
  if (started) return;
  started = true;
  const sources = [
    refereeImg,
    deadPlayerImg,
    malteronPng,
    snakeQueenPng,
    crewA,
    crewB,
  ];
  await Promise.all(sources.map(loadOne));
}

export function getPreloaded(src: string): HTMLImageElement | undefined {
  return cache[src];
}

/** Bundled dragon-chase soundtrack (shipped with the build, no CDN needed). */
export const DRAGON_AUDIO_SRC = dragonMp3;
