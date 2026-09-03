import { GameState, Player, PhiCorpse, PhiSpawnFx, PhiBullet, BotPersonality } from '../types';
import deadPlayerImg from '@/assets/dead-player.png';
import malteronPng from '@/assets/malteron.png';

function loadImg(src: string): HTMLImageElement {
  const img = new Image(); img.src = src; return img;
}
export const DEAD_PLAYER_IMG = loadImg(deadPlayerImg);
export const DEAD_MALTERON_IMG = loadImg(malteronPng);

/**
 * The player the camera/vision should follow. Normally the human; when the
 * human is dead in a PHI competition floor it is the player being spectated.
 */
export function viewPlayer(state: GameState): Player {
  const human = state.players[0];
  const phi = state.phi;
  if (!phi || phi.survivorMode || !human.phiEliminated) return human;
  const target = phi.spectateId !== undefined
    ? state.players.find(p => p.id === phi.spectateId)
    : undefined;
  return target && !target.phiEliminated ? target : human;
}


export function ensurePhiBuffers(state: GameState) {
  const phi = state.phi!;
  if (!phi.corpses) phi.corpses = [];
  if (!phi.spawnFx) phi.spawnFx = [];
  if (!phi.bullets) phi.bullets = [];
  if (phi.nextBulletId === undefined) phi.nextBulletId = 1;
}

export function addCorpse(state: GameState, x: number, y: number, kind: PhiCorpse['kind'], facingX = 1) {
  ensurePhiBuffers(state);
  state.phi!.corpses!.push({
    x, y, kind, facingX,
    spawnedAt: performance.now(),
    ttl: kind === 'malteron' ? 2800 : 4000,
  });
}

export function addSpawnFx(state: GameState, x: number, y: number, color = '#4dd0ff') {
  ensurePhiBuffers(state);
  state.phi!.spawnFx!.push({
    x, y, color,
    startedAt: performance.now(), duration: 500,
  });
}

export function fireBullet(
  state: GameState, ownerId: number,
  x: number, y: number, tx: number, ty: number,
  color = '#ffe066', speed = 0.9,
) {
  ensurePhiBuffers(state);
  const dx = tx - x, dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  const now = performance.now();
  const bul: PhiBullet = {
    id: state.phi!.nextBulletId!++,
    x, y,
    vx: (dx / d) * speed, vy: (dy / d) * speed,
    ownerId, color,
    spawnedAt: now,
    expiresAt: now + 900,
    targetX: tx, targetY: ty,
  };
  state.phi!.bullets!.push(bul);
}

export function tickBullets(state: GameState, dt: number, now: number,
  onHit: (b: PhiBullet) => boolean) {
  const list = state.phi?.bullets;
  if (!list) return;
  for (const b of list) {
    if (b.hit) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (onHit(b)) b.hit = true;
    if (now >= b.expiresAt) b.hit = true;
  }
  state.phi!.bullets = list.filter(b => !b.hit || (now - b.spawnedAt) < 200);
}

export function tickCorpsesAndFx(state: GameState, now: number) {
  const phi = state.phi;
  if (!phi) return;
  if (phi.corpses) phi.corpses = phi.corpses.filter(c => now - c.spawnedAt < c.ttl);
  if (phi.spawnFx) phi.spawnFx = phi.spawnFx.filter(f => now - f.startedAt < f.duration);
}

export function renderCorpses(ctx: CanvasRenderingContext2D, state: GameState, now: number) {
  const phi = state.phi;
  if (!phi?.corpses) return;
  for (const c of phi.corpses) {
    const age = now - c.spawnedAt;
    const alpha = Math.max(0, 1 - age / c.ttl);
    ctx.globalAlpha = alpha;
    const img = c.kind === 'malteron' ? DEAD_MALTERON_IMG : DEAD_PLAYER_IMG;
    const size = c.kind === 'malteron' ? 60 : 46;
    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(c.x, c.y);
      if ((c.facingX ?? 1) < 0) ctx.scale(-1, 1);
      if (c.kind === 'malteron') {
        // desaturate: draw once faded grey
        ctx.filter = 'grayscale(0.7) brightness(0.7)';
      }
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = c.kind === 'malteron' ? '#555' : '#3a3a3a';
      ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }
}

export function renderSpawnFx(ctx: CanvasRenderingContext2D, state: GameState, now: number) {
  const list = state.phi?.spawnFx;
  if (!list) return;
  for (const f of list) {
    const t = (now - f.startedAt) / f.duration;
    if (t < 0 || t > 1) continue;
    const r = 8 + t * 46;
    ctx.strokeStyle = f.color;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // inner glow
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = (1 - t) * 0.6;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function renderBullets(ctx: CanvasRenderingContext2D, state: GameState, now: number) {
  const list = state.phi?.bullets;
  if (!list) return;
  for (const b of list) {
    if (b.hit) {
      // impact burst
      const t = (now - b.spawnedAt) / 200;
      if (t < 0 || t > 1) continue;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4 + t * 14, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    // trail
    const tx = b.x - b.vx * 40;
    const ty = b.y - b.vy * 40;
    const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, b.color);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // core
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Bot personalities ---
export interface PersonalityCfg {
  reactionMs: number;   // delay before responding to stimulus
  riskThreshold: number; // 0..1 (lower = more cautious)
  wanderNoise: number;
  advanceChance: number; // for Nucleus: chance to push toward center
}
export const PERSONALITY: Record<BotPersonality, PersonalityCfg> = {
  A: { reactionMs: 380, riskThreshold: 0.20, wanderNoise: 0.35, advanceChance: 0.15 },
  B: { reactionMs: 260, riskThreshold: 0.35, wanderNoise: 0.25, advanceChance: 0.30 },
  C: { reactionMs: 180, riskThreshold: 0.55, wanderNoise: 0.15, advanceChance: 0.55 },
  D: { reactionMs: 120, riskThreshold: 0.75, wanderNoise: 0.10, advanceChance: 0.85 },
};

export function assignPersonalities(state: GameState) {
  const pool: BotPersonality[] = ['A', 'B', 'C', 'D'];
  for (const p of state.players) {
    if (p.isHuman) continue;
    if (!p.botPersonality) p.botPersonality = pool[Math.floor(Math.random() * pool.length)];
  }
}

/**
 * Award XP. XP is the single currency the PHI standings are built on:
 * nucleus touches, Malteron kills, Mars tasks and correct Neon frequencies
 * all pay out +1 each.
 */
export function awardXP(p: Player, amount = 1) {
  p.phiXP = (p.phiXP ?? 0) + amount;
  p.phiFloorXP = (p.phiFloorXP ?? 0) + amount;
}
