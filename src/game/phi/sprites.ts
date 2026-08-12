import snakeQueenPng from '@/assets/snake-queen.png';
import malteronPng from '@/assets/malteron.png';

function loadImg(url: string): HTMLImageElement {
  const img = new Image();
  img.src = url;
  return img;
}

export const SNAKE_QUEEN_IMG = loadImg(snakeQueenPng);
export const MALTERON_IMG = loadImg(malteronPng);
