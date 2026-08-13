import { GameState, Player, PhiBubble, BubbleKind, PLAYER_RADIUS } from '../types';
import { addCorpse, addSpawnFx } from './shared';

export const BUBBLE_RADIUS = 17;
export const MAX_EXTRA_HEALTH = 5;
const FREEZE_MS = 5000;
const SPEED_MS = 10_000;
const SPEED_MULT = 1.6;
const SPAWN_INTERVAL_MS = 3200;
const MAX_BUBBLES = 14;
const BUBBLE_TTL = 26_000;

/** Per-floor walkable-space adapter used for spawning and safe respawns. */
export interface FloorSpace {
  /** True when a body of PLAYER_RADIUS fits at this point. */
  walkable(x: number, y: number): boolean;
  /** Random walkable point, or null if none could be found. */
  randomPoint(): { x: number; y: number } | null;
}

export const BUBBLE_COLORS: Record<BubbleKind, string> = {
  freeze: '#6fd8ff',
  health: '#ff5d7a',
  speed: '#ffd23f',
};

export function ensureBubbles(state: GameState) {
  const phi = state.phi!;
  if (!phi.bubbles) phi.bubbles = [];
  if (phi.nextBubbleId === undefined) phi.nextBubbleId = 1;
  if (phi.nextBubbleSpawnAt === undefined) phi.nextBubbleSpawnAt = performance.now() + 1500;
}

export function resetBubbles(state: GameState, now = performance.now()) {
  const phi = state.phi!;
  phi.bubbles = [];
  phi.nextBubbleId = 1;
  phi.nextBubbleSpawnAt = now + 2000;
}

/** Freeze is common, speed rare, health extremely rare. */
function rollKind(): BubbleKind {
  const r = Math.random();
  if (r < 0.74) return 'freeze';
  if (r < 0.96) return 'speed';
  return 'health';
}

function spawnBubble(state: GameState, space: FloorSpace, now: number) {
  const phi = state.phi!;
  const kind = rollKind();
  let pos: { x: number; y: number } | null = null;

  if (kind === 'freeze') {
    // Freeze bubbles hunt the players: try to land close to somebody.
    const targets = state.players.filter(p => !p.phiEliminated && !p.phiQualified);
    const t = targets[Math.floor(Math.random() * targets.length)];
    if (t) {
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 90 + Math.random() * 230;
        const x = t.x + Math.cos(a) * d;
        const y = t.y + Math.sin(a) * d;
        if (space.walkable(x, y)) { pos = { x, y }; break; }
      }
    }
  }
  if (!pos) pos = space.randomPoint();
  if (!pos) return;

  phi.bubbles!.push({
    id: phi.nextBubbleId!++,
    kind,
    x: pos.x, y: pos.y,
    spawnedAt: now,
    expiresAt: now + BUBBLE_TTL,
  });
}

export function isFrozen(p: Player, now: number) {
  return (p.phiFrozenUntil ?? 0) > now;
}

/** Movement speed after bubble modifiers. */
export function effSpeed(p: Player, now: number) {
  if (p.phiBaseSpeed === undefined) p.phiBaseSpeed = p.speed;
  if (isFrozen(p, now)) return 0;
  return (p.phiBaseSpeed ?? p.speed) * ((p.phiSpeedUntil ?? 0) > now ? SPEED_MULT : 1);
}

function pickUp(state: GameState, p: Player, b: PhiBubble, now: number) {
  if (b.kind === 'freeze') {
    p.phiFrozenUntil = now + FREEZE_MS;
    p.direction = { x: 0, y: 0 };
    addSpawnFx(state, p.x, p.y, BUBBLE_COLORS.freeze);
  } else if (b.kind === 'speed') {
    p.phiSpeedUntil = now + SPEED_MS;
    addSpawnFx(state, p.x, p.y, BUBBLE_COLORS.speed);
  } else {
    p.phiExtraHealth = Math.min(MAX_EXTRA_HEALTH, (p.phiExtraHealth ?? 0) + 1);
    addSpawnFx(state, p.x, p.y, BUBBLE_COLORS.health);
  }
}

/** Spawn, expire and collide bubbles. Call once per floor tick. */
export function tickBubbles(state: GameState, now: number, space: FloorSpace) {
  ensureBubbles(state);
  const phi = state.phi!;
  if (now >= (phi.nextBubbleSpawnAt ?? 0)) {
    phi.nextBubbleSpawnAt = now + SPAWN_INTERVAL_MS;
    if ((phi.bubbles!.length ?? 0) < MAX_BUBBLES) spawnBubble(state, space, now);
  }
  const taken = new Set<number>();
  for (const b of phi.bubbles!) {
    if (now >= b.expiresAt) { taken.add(b.id); continue; }
    for (const p of state.players) {
      if (p.phiEliminated || p.phiQualified) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < BUBBLE_RADIUS + PLAYER_RADIUS - 4) {
        pickUp(state, p, b, now);
        taken.add(b.id);
        break;
      }
    }
  }
  if (taken.size) phi.bubbles = phi.bubbles!.filter(b => !taken.has(b.id));

  // Frozen players cannot act.
  for (const p of state.players) {
    if (isFrozen(p, now)) p.direction = { x: 0, y: 0 };
  }
}

/**
 * Apply a lethal hit. Extra hearts absorb it: the player respawns at a safe
 * walkable point instead of dying. Returns true when the player is out.
 */
export function hitPlayer(state: GameState, p: Player, space: FloorSpace, now = performance.now()): boolean {
  if (p.phiEliminated) return true;
  if ((p.phiExtraHealth ?? 0) > 0) {
    p.phiExtraHealth = (p.phiExtraHealth ?? 0) - 1;
    const pos = space.randomPoint();
    if (pos) { p.x = pos.x; p.y = pos.y; }
    p.direction = { x: 0, y: 0 };
    p.phiFrozenUntil = 0;
    p.phiProtectedUntil = now + 1600;
    p.phiHeat = 0;
    addSpawnFx(state, p.x, p.y, '#ff5d7a');
    return false;
  }
  p.phiEliminated = true;
  p.alive = false;
  addCorpse(state, p.x, p.y, 'player', p.facingX ?? 1);
  return true;
}

/**
 * Bubble steering for bots. Weight encodes how strongly the desire competes
 * with survival/objective steering, following the configured priorities:
 *   normal   : ALIVE > WIN > AVOID FREEZE > SPEED > HEALTH
 *   enhanced : WIN > HEALTH > ALIVE > AVOID FREEZE > SPEED
 */
export function bubbleSteer(
  state: GameState, p: Player, now: number,
): { x: number; y: number; weight: number } {
  const phi = state.phi;
  const list = phi?.bubbles ?? [];
  if (!list.length) return { x: 0, y: 0, weight: 0 };
  const enhanced = !!p.enhanced;
  const RANGE = enhanced ? 560 : 380;

  let vx = 0, vy = 0, weight = 0;
  let bestWant: { d: number; x: number; y: number; w: number } | null = null;

  for (const b of list) {
    const dx = b.x - p.x, dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (b.kind === 'freeze') {
      // Always avoid, and never path through one.
      if (d < 150) {
        const w = enhanced ? 0.55 : 0.85;
        vx -= (dx / d) * w; vy -= (dy / d) * w;
        weight = Math.max(weight, w);
      }
      continue;
    }
    if (d > RANGE) continue;
    let w: number;
    if (b.kind === 'health') {
      if ((p.phiExtraHealth ?? 0) >= MAX_EXTRA_HEALTH) continue;
      w = enhanced ? 0.95 : 0.35;
    } else {
      if ((p.phiSpeedUntil ?? 0) > now) continue;
      w = enhanced ? 0.3 : 0.5;
    }
    if (!bestWant || w / d > bestWant.w / bestWant.d) bestWant = { d, x: dx / d, y: dy / d, w };
  }

  if (bestWant) {
    vx += bestWant.x * bestWant.w;
    vy += bestWant.y * bestWant.w;
    weight = Math.max(weight, bestWant.w);
  }
  const n = Math.hypot(vx, vy);
  if (n < 0.001) return { x: 0, y: 0, weight: 0 };
  return { x: vx / n, y: vy / n, weight };
}

// ---------------- Rendering ----------------

function bubbleGlyph(ctx: CanvasRenderingContext2D, kind: BubbleKind, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  if (kind === 'health') {
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-8, -2, -4.5, -8, 0, -3.5);
    ctx.bezierCurveTo(4.5, -8, 8, -2, 0, 5);
    ctx.fill();
  } else if (kind === 'speed') {
    ctx.beginPath();
    ctx.moveTo(2.5, -8); ctx.lineTo(-4.5, 1); ctx.lineTo(0, 1);
    ctx.lineTo(-2.5, 8); ctx.lineTo(4.5, -1); ctx.lineTo(0, -1);
    ctx.closePath(); ctx.fill();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * 7, -Math.sin(a) * 7);
      ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderBubbles(ctx: CanvasRenderingContext2D, state: GameState, now: number) {
  const list = state.phi?.bubbles;
  if (!list?.length) return;
  for (const b of list) {
    const pulse = 1 + Math.sin((now - b.spawnedAt) / 320) * 0.08;
    const r = BUBBLE_RADIUS * pulse;
    const col = BUBBLE_COLORS[b.kind];
    const fading = b.expiresAt - now < 3000;
    ctx.globalAlpha = fading ? 0.45 + 0.4 * Math.abs(Math.sin(now / 140)) : 1;

    const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, 1, b.x, b.y, r * 1.7);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.7, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(b.x - r * 0.3, b.y - r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.stroke();
    bubbleGlyph(ctx, b.kind, b.x, b.y);
  }
  ctx.globalAlpha = 1;
}

/** Blue freeze shell + extra-heart pips drawn over affected players. */
export function renderPlayerStatus(ctx: CanvasRenderingContext2D, state: GameState, now: number) {
  for (const p of state.players) {
    if (p.phiEliminated) continue;
    if (isFrozen(p, now)) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#5ec8ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_RADIUS + 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#d7f4ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_RADIUS + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#eaf9ff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(((p.phiFrozenUntil ?? 0) - now) / 1000)}s`, p.x, p.y - PLAYER_RADIUS - 16);
      ctx.restore();
    }
    if ((p.phiSpeedUntil ?? 0) > now) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = BUBBLE_COLORS.speed;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_RADIUS + 12, 0, Math.PI * 1.4); ctx.stroke();
      ctx.restore();
    }
    const hearts = p.phiExtraHealth ?? 0;
    if (hearts > 0) {
      ctx.save();
      ctx.fillStyle = BUBBLE_COLORS.health;
      for (let i = 0; i < hearts; i++) {
        ctx.beginPath();
        ctx.arc(p.x - (hearts - 1) * 4 + i * 8, p.y - PLAYER_RADIUS - 26, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
