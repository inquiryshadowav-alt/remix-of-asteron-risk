import snakeQueenJson from '@/assets/snake-queen.png.asset.json';
import malteronJson from '@/assets/malteron.png.asset.json';

function loadImg(url: string): HTMLImageElement {
  const img = new Image();
  img.src = url;
  return img;
}

export const SNAKE_QUEEN_IMG = loadImg(snakeQueenJson.url);
export const MALTERON_IMG = loadImg(malteronJson.url);
