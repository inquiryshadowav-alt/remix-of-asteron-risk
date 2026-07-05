import crewA from '@/assets/char-crew-a.png';
import crewB from '@/assets/char-crew-b.png';

function loadImg(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export const ROBOT_PLAYER = loadImg(crewA);
export const ROBOT_CREW = loadImg(crewB);

// Per-entity facing memory so robots don't flip every frame on jitter.
const FACING = new Map<string, number>();

export interface RobotOpts {
  x: number;
  y: number;
  dirX: number;         // input dir X (-1..1)
  dirY?: number;
  size?: number;
  label?: string;       // name over head
  subLabel?: string;    // extra tag under name (e.g. "SHOOTER")
  subColor?: string;
  variant?: 'player' | 'crew';
  keyId: string;        // stable id for facing memory
  time?: number;
  moving?: boolean;
}

/** Draw the ASTERON blue robot with slight body tilt on horizontal motion.
 *  Facing flips on horizontal input; release input → instant stop (caller). */
export function drawRobot(ctx: CanvasRenderingContext2D, o: RobotOpts) {
  const size = o.size ?? 52;
  const t = o.time ?? performance.now();
  const moving = o.moving ?? (Math.abs(o.dirX) + Math.abs(o.dirY ?? 0) > 0.15);
  const bob = moving ? Math.sin(t * 0.012 + o.keyId.length) * 1.5 : Math.sin(t * 0.003) * 1.5;

  // Facing lock — only flip on decisive horizontal input.
  let facing = FACING.get(o.keyId) ?? 1;
  if (moving && Math.abs(o.dirX) > 0.4) facing = o.dirX > 0 ? 1 : -1;
  FACING.set(o.keyId, facing);
  const tilt = moving ? Math.max(-0.22, Math.min(0.22, o.dirX * 0.22)) : 0;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(o.x, o.y + size * 0.42, size * 0.30, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  const img = o.variant === 'crew' ? ROBOT_CREW : ROBOT_PLAYER;
  ctx.save();
  ctx.translate(o.x, o.y + bob);
  ctx.rotate(tilt);
  ctx.scale(facing, 1);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = o.variant === 'crew' ? '#7fd0ff' : '#4a90d9';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (o.label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(o.label, o.x, o.y - size * 0.6);
  }
  if (o.subLabel) {
    ctx.fillStyle = o.subColor ?? '#ff5252';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(o.subLabel, o.x, o.y - size * 0.6 - 12);
  }
}
