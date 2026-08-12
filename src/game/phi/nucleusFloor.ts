import { GameState, Player, PLAYER_RADIUS, PhiElectron, PhiSnakeQueen } from '../types';
import { SNAKE_QUEEN_IMG } from './sprites';
import { drawRobot } from './robot';
import { addCorpse, renderCorpses, renderSpawnFx, PERSONALITY, viewPlayer } from './shared';

const MAP_W = 2000;
const MAP_H = 1400;
const NUCLEUS_R = 80;
const ELECTRON_SIZE = 22;

// Inner shells faster (survival priority for cautious bots).
const ORBITS = {
  s5: { r: 620, count: 12, speed:  0.00016 },
  s4: { r: 500, count: 10, speed: -0.00024 },
  s3: { r: 380, count:  8, speed:  0.00055 },
  s2: { r: 250, count:  5, speed: -0.00110 },
  s1: { r: 140, count:  2, speed:  0.00230 },
} as const;

type OrbitKey = keyof typeof ORBITS;

function cx(state: GameState) { return state.mapWidth / 2; }
function cy(state: GameState) { return state.mapHeight / 2; }

export function initNucleusFloor(state: GameState) {
  state.mapWidth = MAP_W;
  state.mapHeight = MAP_H;
  state.taskStations = [];
  state.doors = [];
  state.powerups = [];
  state.projectiles = [];
  state.platforms = [];

  const electrons: PhiElectron[] = [];
  (Object.keys(ORBITS) as OrbitKey[]).forEach(o => {
    const cfg = ORBITS[o];
    for (let i = 0; i < cfg.count; i++) {
      electrons.push({
        orbit: o as any,
        angle: (i / cfg.count) * Math.PI * 2 + Math.random() * 0.3,
        angularSpeed: cfg.speed,
        orbitRadius: cfg.r,
        size: ELECTRON_SIZE,
      });
    }
  });
  const sq: PhiSnakeQueen = {
    x: 250, y: 250, tx: 250, ty: 250, facingX: 1,
    detectionRadius: 155, nextTargetAt: 0, bobT: 0,
  };
  state.phi!.electrons = electrons;
  state.phi!.nucleusRadius = NUCLEUS_R;
  state.phi!.snakeQueen = sq;

  const active = state.players.filter(p => !p.phiEliminated);
  active.forEach((p, i) => {
    const angle = (i / active.length) * Math.PI * 2;
    p.x = cx(state) + Math.cos(angle) * (ORBITS.s5.r + 90);
    p.y = cy(state) + Math.sin(angle) * (ORBITS.s5.r + 90);
    p.x = Math.max(60, Math.min(MAP_W - 60, p.x));
    p.y = Math.max(60, Math.min(MAP_H - 60, p.y));
    p.direction = { x: 0, y: 0 };
    p.phiFrozen = false;
  });
}

function electronPositions(state: GameState) {
  const c = { x: cx(state), y: cy(state) };
  return (state.phi!.electrons ?? []).map(e => ({
    x: c.x + Math.cos(e.angle) * e.orbitRadius,
    y: c.y + Math.sin(e.angle) * e.orbitRadius,
    r: e.size,
  }));
}

export function tickNucleus(
  state: GameState, dt: number, keys: Set<string>, now: number, isMobile: boolean,
) {
  const phi = state.phi!;
  for (const e of phi.electrons ?? []) e.angle += e.angularSpeed * dt;

  // Snake Queen wanders the whole map
  const sq = phi.snakeQueen!;
  sq.bobT += dt;
  if (now > sq.nextTargetAt || Math.hypot(sq.tx - sq.x, sq.ty - sq.y) < 20) {
    sq.tx = 120 + Math.random() * (state.mapWidth - 240);
    sq.ty = 120 + Math.random() * (state.mapHeight - 240);
    sq.nextTargetAt = now + 1800 + Math.random() * 2200;
  }
  const sdx = sq.tx - sq.x, sdy = sq.ty - sq.y;
  const sd = Math.max(1, Math.hypot(sdx, sdy));
  sq.x += (sdx / sd) * 1.5;
  sq.y += (sdy / sd) * 1.5;
  if (Math.abs(sdx) > 0.5) sq.facingX = sdx > 0 ? 1 : -1;

  // Human input
  const human = state.players[0];
  if (human.alive && !human.phiEliminated && !human.phiQualified) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const d = Math.sqrt(dx * dx + dy * dy);
      human.direction = { x: dx / d, y: dy / d };
    } else if (!isMobile) {
      human.direction = { x: 0, y: 0 };
    }
  }

  const ePos = electronPositions(state);
  const cxN = cx(state), cyN = cy(state);

  for (const p of state.players) {
    if (p.phiEliminated || p.phiQualified) continue;

    // Snake Queen instant kill
    if (Math.hypot(p.x - sq.x, p.y - sq.y) < sq.detectionRadius) {
      p.phiEliminated = true; p.alive = false;
      addCorpse(state, p.x, p.y, 'player', p.facingX ?? 1);
      continue;
    }

    // Bot AI: SURVIVE first, then advance. Cautious personality bias.
    if (!p.isHuman) {
      const cfg = PERSONALITY[p.botPersonality ?? 'B'];
      let dirX = 0, dirY = 0;
      // Check nearby electron danger within perception radius
      let danger = 0;
      for (const e of ePos) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 90) { dirX += (p.x - e.x) / d; dirY += (p.y - e.y) / d; danger++; }
      }
      // Snake queen avoidance
      const dq = Math.hypot(sq.x - p.x, sq.y - p.y);
      if (dq < sq.detectionRadius + 90) {
        dirX += (p.x - sq.x) / dq; dirY += (p.y - sq.y) / dq; danger++;
      }
      if (danger === 0 && Math.random() < cfg.advanceChance) {
        const dxN = cxN - p.x, dyN = cyN - p.y;
        const dN = Math.max(1, Math.hypot(dxN, dyN));
        dirX = dxN / dN; dirY = dyN / dN;
      } else if (danger === 0) {
        // hold pocket with small wander
        dirX = (Math.random() - 0.5) * cfg.wanderNoise;
        dirY = (Math.random() - 0.5) * cfg.wanderNoise;
      }
      const n = Math.hypot(dirX, dirY) || 1;
      p.direction = { x: dirX / n, y: dirY / n };
    }

    p.x += p.direction.x * p.speed;
    p.y += p.direction.y * p.speed;
    if (Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.1) {
      p.facingX = p.direction.x; p.facingY = p.direction.y;
    }
    p.x = Math.max(PLAYER_RADIUS, Math.min(state.mapWidth - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(state.mapHeight - PLAYER_RADIUS, p.y));

    for (const e of ePos) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + PLAYER_RADIUS - 2) {
        p.phiEliminated = true; p.alive = false;
        addCorpse(state, p.x, p.y, 'player', p.facingX ?? 1);
        break;
      }
    }
    if (p.phiEliminated) continue;

    if (Math.hypot(cxN - p.x, cyN - p.y) < (phi.nucleusRadius! - 4)) {
      p.phiQualified = true;
    }
  }
}

// ==== Rendering ====

function drawHedge(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#3ba95e';
  ctx.fillRect(0, 0, w, h);
  const tile = 90;
  for (let x = 0; x < w; x += tile) {
    for (let y = 0; y < h; y += tile) {
      if (x < 90 || y < 90 || x > w - tile - 90 || y > h - tile - 90) {
        ctx.fillStyle = '#1f5a30';
        ctx.fillRect(x, y, tile - 4, tile - 4);
        ctx.fillStyle = '#4fd07c';
        ctx.beginPath();
        ctx.arc(x + tile / 2, y + tile / 2, tile / 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#7fc38c';
  ctx.fillRect(90, 90, w - 180, h - 180);
}

function drawOrbits(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.strokeStyle = 'rgba(180,80,220,0.55)';
  ctx.lineWidth = 5;
  for (const k of Object.keys(ORBITS) as OrbitKey[]) {
    ctx.beginPath();
    ctx.arc(cx, cy, ORBITS[k].r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawNucleus(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
  g.addColorStop(0, 'rgba(255,120,220,0.95)');
  g.addColorStop(0.5, 'rgba(230,50,180,0.65)');
  g.addColorStop(1, 'rgba(180,30,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff7ad0';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawElectron(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  g.addColorStop(0, '#2d5a2d');
  g.addColorStop(0.7, 'rgba(45,90,45,0.6)');
  g.addColorStop(1, 'rgba(45,90,45,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f3a1f';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnakeQueen(ctx: CanvasRenderingContext2D, sq: PhiSnakeQueen) {
  const g = ctx.createRadialGradient(sq.x, sq.y, 0, sq.x, sq.y, sq.detectionRadius);
  g.addColorStop(0, 'rgba(255,60,60,0.38)');
  g.addColorStop(0.7, 'rgba(255,60,60,0.18)');
  g.addColorStop(1, 'rgba(255,60,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sq.x, sq.y, sq.detectionRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sq.x, sq.y + 26, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(sq.bobT / 200) * 3;
  const tilt = Math.sin(sq.bobT / 300) * 0.06;
  ctx.save();
  ctx.translate(sq.x, sq.y + bob);
  ctx.rotate(tilt);
  if (sq.facingX < 0) ctx.scale(-1, 1);
  const size = 96;
  if (SNAKE_QUEEN_IMG.complete && SNAKE_QUEEN_IMG.naturalWidth > 0) {
    ctx.drawImage(SNAKE_QUEEN_IMG, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#f8b6d2';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function renderNucleus(
  ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number,
) {
  const human = viewPlayer(state);
  const camX = Math.max(0, Math.min(state.mapWidth - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(state.mapHeight - canvasH, human.y - canvasH / 2));
  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(-camX, -camY);

  drawHedge(ctx, state.mapWidth, state.mapHeight);
  const cxN = state.mapWidth / 2, cyN = state.mapHeight / 2;
  drawOrbits(ctx, cxN, cyN);
  drawNucleus(ctx, cxN, cyN, state.phi!.nucleusRadius!);

  for (const e of state.phi!.electrons ?? []) {
    const x = cxN + Math.cos(e.angle) * e.orbitRadius;
    const y = cyN + Math.sin(e.angle) * e.orbitRadius;
    drawElectron(ctx, x, y, e.size);
  }

  drawSnakeQueen(ctx, state.phi!.snakeQueen!);

  for (const p of state.players) {
    if (p.phiEliminated) continue;
    drawRobot(ctx, {
      x: p.x, y: p.y,
      dirX: p.direction.x, dirY: p.direction.y,
      moving: Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.15,
      keyId: `nuc-${p.id}`,
      label: p.name,
    });
  }

  const now = performance.now();
  renderCorpses(ctx, state, now);
  renderSpawnFx(ctx, state, now);

  ctx.restore();
}

