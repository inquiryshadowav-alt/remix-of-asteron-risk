import refereeImg from '@/assets/referee.png';
import deadPlayerImg from '@/assets/dead-player.png';
import malteronJson from '@/assets/malteron.png.asset.json';
import snakeQueenJson from '@/assets/snake-queen.png.asset.json';

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
    (malteronJson as any).url,
    (snakeQueenJson as any).url,
  ];
  await Promise.all(sources.map(loadOne));
}

export function getPreloaded(src: string): HTMLImageElement | undefined {
  return cache[src];
}
