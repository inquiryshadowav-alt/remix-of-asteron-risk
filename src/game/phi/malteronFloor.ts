import { GameState, Player, PhiMalteron, PhiCrew, PLAYER_RADIUS } from '../types';
import { MALTERON_IMG } from './sprites';
import { drawRobot } from './robot';
import {
  ensurePhiBuffers, addCorpse, addSpawnFx, fireBullet as spawnBullet,
  tickBullets, renderBullets, renderCorpses, renderSpawnFx,
  PERSONALITY,
} from './shared';

const DETECTION_RADIUS = 220;
const MALTERON_SPAWN_SAFE_MS = 2500;

/**
 * FLOOR 3 — MALTERON
 * Sliding-puzzle arena: 3×3 grid of blocks, one empty. Every 15s one
 * random block adjacent to the empty cell slides into it.
 * Every block contains a fixed curved pathway. Entities can only move
 * along that curve; they can cross to a neighbor only when both blocks'
 * curves touch the shared edge.
 * Entities standing on a block are carried with it when the block moves.
 */

const BLOCK_SIZE = 260;
const GRID_ORIGIN = { x: 250, y: 250 };
const MAP_W = GRID_ORIGIN.x * 2 + BLOCK_SIZE * 3;
const MAP_H = GRID_ORIGIN.y * 2 + BLOCK_SIZE * 3;
const SHIFT_INTERVAL = 15_000;
const PATH_HALF_WIDTH = 26;    // half thickness of the walkable curve
const ENTITY_R = 14;

type Edge = 'N' | 'E' | 'S' | 'W';
const EDGE_ORDER: Edge[] = ['N', 'E', 'S', 'W'];

/** All allowed path shapes (each connects two edges). */
type PathType =
  | 'NS' | 'EW'
  | 'NE' | 'NW' | 'SE' | 'SW';

interface Block {
  id: number;
  row: number;      // 0..2 grid row (target)
  col: number;      // 0..2 grid col (target)
  animRow: number;  // visual/current position (smoothly lerps to row)
  animCol: number;
  pathType: PathType;
}

interface EntityPath {
  blockId: number;
  t: number;       // 0..1 along path
}

interface MalteronRuntime {
  blocks: Block[];       // 8 blocks
  emptyRow: number;
  emptyCol: number;
  nextShiftAt: number;
  playerPaths: Map<number, EntityPath>;   // by player.id
  crewPaths: Map<number, EntityPath>;     // by crew.id
  malteronPaths: Map<number, EntityPath>; // by malteron.id
  nextBlockId: number;
  aiCursor: number;     // time-sliced AI round-robin index
}

// Stash on state.phi.
declare module '../types' {
  interface PhiState {
    mRuntime?: MalteronRuntime;
  }
}

// ---------- Path geometry ----------

/** Endpoints on a unit block (0..1) for each pathType. */
function endpoints(pt: PathType): [Edge, Edge] {
  switch (pt) {
    case 'NS': return ['N', 'S'];
    case 'EW': return ['E', 'W'];
    case 'NE': return ['N', 'E'];
    case 'NW': return ['N', 'W'];
    case 'SE': return ['S', 'E'];
    case 'SW': return ['S', 'W'];
  }
}

function edgePoint(edge: Edge): { x: number; y: number } {
  // Local block coords, [0..BLOCK_SIZE]
  const M = BLOCK_SIZE / 2;
  switch (edge) {
    case 'N': return { x: M, y: 0 };
    case 'S': return { x: M, y: BLOCK_SIZE };
    case 'E': return { x: BLOCK_SIZE, y: M };
    case 'W': return { x: 0, y: M };
  }
}

/** Sample a point at parameter t (0..1) on the block-local path. */
function pathPoint(pt: PathType, t: number): { x: number; y: number } {
  const [a, b] = endpoints(pt);
  const pa = edgePoint(a);
  const pb = edgePoint(b);
  if (pt === 'NS' || pt === 'EW') {
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  }
  // Curve corner (quarter circle) centered at the corner opposite to the
  // arc bulge. For NE, center at N-E corner (top-right) -> (BLOCK_SIZE, 0),
  // radius = BLOCK_SIZE/2, arc from angle pi (facing left edge midpoint N)
  // to 3pi/2 (facing bottom edge midpoint E). Easier: interpolate along
  // quadratic bezier through the two endpoints and the corner midpoint.
  let corner: { x: number; y: number };
  switch (pt) {
    case 'NE': corner = { x: BLOCK_SIZE, y: 0 }; break;
    case 'NW': corner = { x: 0, y: 0 }; break;
    case 'SE': corner = { x: BLOCK_SIZE, y: BLOCK_SIZE }; break;
    case 'SW': corner = { x: 0, y: BLOCK_SIZE }; break;
  }
  // Quadratic bezier: B(t) = (1-t)^2 * pa + 2(1-t)t * corner + t^2 * pb
  const u = 1 - t;
  return {
    x: u * u * pa.x + 2 * u * t * corner!.x + t * t * pb.x,
    y: u * u * pa.y + 2 * u * t * corner!.y + t * t * pb.y,
  };
}

/** Which edge (N/E/S/W) does param t=0 correspond to on this path? */
function edgeAtParam(pt: PathType, t: number): Edge {
  const [a, b] = endpoints(pt);
  return t <= 0.001 ? a : b;
}

/** Given a block and an edge, what param value corresponds to that edge? */
function paramForEdge(pt: PathType, edge: Edge): number | null {
  const [a, b] = endpoints(pt);
  if (a === edge) return 0;
  if (b === edge) return 1;
  return null;
}

const OPP: Record<Edge, Edge> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DXY: Record<Edge, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// ---------- World coordinate helpers ----------

function blockWorldOrigin(b: Block): { x: number; y: number } {
  return {
    x: GRID_ORIGIN.x + b.animCol * BLOCK_SIZE,
    y: GRID_ORIGIN.y + b.animRow * BLOCK_SIZE,
  };
}

function entityWorldPos(b: Block, t: number): { x: number; y: number } {
  const o = blockWorldOrigin(b);
  const lp = pathPoint(b.pathType, t);
  return { x: o.x + lp.x, y: o.y + lp.y };
}

function findBlock(rt: MalteronRuntime, row: number, col: number): Block | undefined {
  return rt.blocks.find(b => b.row === row && b.col === col);
}

// ---------- Init ----------

const RANDOM_PATHS: PathType[] = ['NS', 'EW', 'NE', 'NW', 'SE', 'SW'];

function randomPathType(): PathType {
  return RANDOM_PATHS[Math.floor(Math.random() * RANDOM_PATHS.length)];
}

/** Ensure adjacent blocks share at least some connectivity by biasing shapes. */
function buildBlocks(emptyRow: number, emptyCol: number): Block[] {
  const blocks: Block[] = [];
  let id = 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === emptyRow && c === emptyCol) continue;
      blocks.push({
        id: id++,
        row: r, col: c,
        animRow: r, animCol: c,
        pathType: randomPathType(),
      });
    }
  }
  return blocks;
}

export function initMalteronFloor(state: GameState) {
  state.mapWidth = MAP_W;
  state.mapHeight = MAP_H;
  state.taskStations = [];
  state.doors = [];
  state.powerups = [];
  state.projectiles = [];
  state.platforms = [];

  const emptyRow = Math.floor(Math.random() * 3);
  const emptyCol = Math.floor(Math.random() * 3);
  const blocks = buildBlocks(emptyRow, emptyCol);

  const rt: MalteronRuntime = {
    blocks,
    emptyRow, emptyCol,
    nextShiftAt: performance.now() + SHIFT_INTERVAL,
    playerPaths: new Map(),
    crewPaths: new Map(),
    malteronPaths: new Map(),
    nextBlockId: blocks.length + 1,
    aiCursor: 0,
  };
  state.phi!.mRuntime = rt;

  // Randomised block assignment per player so spawns are not fixed.
  const active = state.players.filter(p => !p.phiEliminated);
  const shuffled = [...blocks].sort(() => Math.random() - 0.5);
  const crew: PhiCrew[] = [];
  let cid = 1;
  active.forEach((p, i) => {
    const b = shuffled[i % shuffled.length];
    const startT = 0.3 + Math.random() * 0.4; // avoid identical spawn points
    rt.playerPaths.set(p.id, { blockId: b.id, t: startT });
    const pos = entityWorldPos(b, startT);
    p.x = pos.x; p.y = pos.y;
    p.direction = { x: 0, y: 0 };
    p.phiBullets = 3;
    p.phiReloadUntil = 0;

    const crewT = Math.max(0.1, Math.min(0.9, startT + (Math.random() - 0.5) * 0.2));
    const cPos = entityWorldPos(b, crewT);
    const cEnt: PhiCrew = {
      id: cid, shooterId: p.id,
      x: cPos.x, y: cPos.y, facingX: 1, alive: true,
    };
    crew.push(cEnt);
    rt.crewPaths.set(cid, { blockId: b.id, t: crewT });
    p.phiCrewId = cid;
    cid++;
  });
  state.phi!.crew = crew;
  state.phi!.nextCrewId = cid;

  state.phi!.malterons = [];
  state.phi!.nextMalteronId = 1;
  // 10-second pre-round countdown before Malterons appear.
  state.phi!.malteronCountdownUntil = performance.now() + 10_000;
  state.phi!.malteronSpawned = false;
  state.phi!.nextMalteronSpawnAt = 0;
  state.phi!.pendingMalteronSpawns = [];
}

function spawnMalteron(state: GameState) {
  ensurePhiBuffers(state);
  const rt = state.phi!.mRuntime!;
  const phi = state.phi!;
  const scored = rt.blocks.map(b => ({
    b,
    n: [...rt.playerPaths.values(), ...rt.crewPaths.values(), ...rt.malteronPaths.values()]
      .filter(p => p.blockId === b.id).length,
  }));
  scored.sort((a, b) => a.n - b.n);
  const b = scored[Math.floor(Math.random() * Math.min(3, scored.length))].b;
  // Spawn at a path ENDPOINT (curve entry / corner), not random interior.
  const t = Math.random() < 0.5 ? 0.02 : 0.98;
  const pos = entityWorldPos(b, t);
  const now = performance.now();
  const m: PhiMalteron = {
    id: phi.nextMalteronId!,
    x: pos.x, y: pos.y,
    vx: 0, vy: 0,
    facingX: 1,
    alive: true,
    targetCrewId: null,
  };
  (m as any).spawnAt = now;
  phi.nextMalteronId!++;
  phi.malterons!.push(m);
  rt.malteronPaths.set(m.id, { blockId: b.id, t });
  addSpawnFx(state, pos.x, pos.y, '#4dd0ff');
}


// ---------- Shifting ----------

function tickShift(state: GameState, now: number, dt: number) {
  const rt = state.phi!.mRuntime!;

  // Smooth anim toward target grid positions.
  const lerp = Math.min(1, dt / 220);
  for (const b of rt.blocks) {
    b.animRow += (b.row - b.animRow) * lerp;
    b.animCol += (b.col - b.animCol) * lerp;
  }

  if (now < rt.nextShiftAt) return;
  rt.nextShiftAt = now + SHIFT_INTERVAL;

  // Pick a random block adjacent to the empty cell and slide it in.
  const candidates: Block[] = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    const b = findBlock(rt, rt.emptyRow + dr, rt.emptyCol + dc);
    if (b) candidates.push(b);
  }
  if (candidates.length === 0) return;
  const mover = candidates[Math.floor(Math.random() * candidates.length)];
  const oldRow = mover.row, oldCol = mover.col;
  mover.row = rt.emptyRow;
  mover.col = rt.emptyCol;
  rt.emptyRow = oldRow;
  rt.emptyCol = oldCol;
  // Entities on `mover` are carried automatically because we render/tick
  // by (block, t) — recomputing world pos next frame reflects new origin.
}

// ---------- Movement ----------

function tryCrossEdge(rt: MalteronRuntime, ep: EntityPath, edge: Edge): boolean {
  const b = rt.blocks.find(x => x.id === ep.blockId);
  if (!b) return false;
  const [drdc] = [DXY[edge]];
  const [dc, dr] = [drdc[0], drdc[1]];
  const neighbor = findBlock(rt, b.row + dr, b.col + dc);
  if (!neighbor) return false;
  const nEdge = OPP[edge];
  const nT = paramForEdge(neighbor.pathType, nEdge);
  if (nT === null) return false;
  ep.blockId = neighbor.id;
  ep.t = nT;
  return true;
}

function moveEntityAlong(rt: MalteronRuntime, ep: EntityPath, inputX: number, inputY: number, speed: number) {
  const b = rt.blocks.find(x => x.id === ep.blockId);
  if (!b) return;
  if (Math.abs(inputX) + Math.abs(inputY) < 0.1) return;

  // Compute path tangent at current t.
  const eps = 0.01;
  const t0 = Math.max(0, Math.min(1, ep.t - eps));
  const t1 = Math.max(0, Math.min(1, ep.t + eps));
  const p0 = pathPoint(b.pathType, t0);
  const p1 = pathPoint(b.pathType, t1);
  let tx = p1.x - p0.x, ty = p1.y - p0.y;
  const tn = Math.hypot(tx, ty) || 1;
  tx /= tn; ty /= tn;

  // Dot input with tangent → signed step.
  const dot = inputX * tx + inputY * ty;
  if (Math.abs(dot) < 0.15) return;

  // How much local-t does `speed` px translate to? Approx path length ≈ BLOCK_SIZE.
  const step = (dot * speed) / BLOCK_SIZE;
  ep.t += step;

  // Handle crossings.
  if (ep.t <= 0) {
    const edge = edgeAtParam(b.pathType, 0);
    if (tryCrossEdge(rt, ep, edge)) return;
    ep.t = 0;
  } else if (ep.t >= 1) {
    const edge = edgeAtParam(b.pathType, 1);
    if (tryCrossEdge(rt, ep, edge)) return;
    ep.t = 1;
  }
}

// ---------- Combat ----------

function fireBullet(state: GameState, shooter: Player, now: number) {
  if (!shooter.alive || shooter.phiEliminated) return;
  if ((shooter.phiReloadUntil ?? 0) > now) return;
  if ((shooter.phiBullets ?? 0) <= 0) return;
  const phi = state.phi!;
  let best: PhiMalteron | null = null;
  let bestD = Infinity;
  for (const m of phi.malterons ?? []) {
    if (!m.alive) continue;
    const d = Math.hypot(m.x - shooter.x, m.y - shooter.y);
    if (d < bestD && d < 460) { bestD = d; best = m; }
  }
  if (!best) return;
  // Spawn animated projectile toward target's current position.
  spawnBullet(state, shooter.id, shooter.x, shooter.y, best.x, best.y, '#ffe066', 0.95);
  shooter.phiBullets = (shooter.phiBullets ?? 3) - 1;
  if (shooter.phiBullets <= 0) {
    shooter.phiReloadUntil = now + 3000;
    shooter.phiBullets = 3;
  }
}

// ---------- Tick ----------

export function tickMalteron(
  state: GameState, dt: number, keys: Set<string>, now: number, isMobile: boolean,
) {
  const phi = state.phi!;
  const rt = phi.mRuntime!;
  if (!rt) return;

  tickShift(state, now, dt);

  // Human input
  const human = state.players[0];
  let humanInput = { x: 0, y: 0 };
  if (human.alive && !human.phiEliminated && !human.phiQualified) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const d = Math.sqrt(dx * dx + dy * dy);
      humanInput = { x: dx / d, y: dy / d };
      human.direction = humanInput;
    } else if (!isMobile) {
      human.direction = { x: 0, y: 0 };
    } else {
      humanInput = { ...human.direction };
    }
    if (keys.has(' ') || keys.has('space')) fireBullet(state, human, now);
  }

  // Advance each player along its path
  for (const p of state.players) {
    if (p.phiEliminated || p.phiQualified) continue;
    const ep = rt.playerPaths.get(p.id);
    if (!ep) continue;
    let input = { x: p.direction.x, y: p.direction.y };
    if (!p.isHuman) {
      // Bot: move toward own crew if on different block; else stand ground.
      const crew = phi.crew?.find(c => c.id === p.phiCrewId);
      if (crew && crew.alive) {
        const dx = crew.x - p.x, dy = crew.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 60) input = { x: dx / d, y: dy / d };
        else input = { x: 0, y: 0 };
      }
      fireBullet(state, p, now);
    }
    moveEntityAlong(rt, ep, input.x, input.y, p.speed);
    const b = rt.blocks.find(x => x.id === ep.blockId);
    if (b) {
      const pos = entityWorldPos(b, ep.t);
      p.x = pos.x; p.y = pos.y;
      if (Math.abs(input.x) > 0.1) p.facingX = input.x;
    }
  }

  // Crew AI — flee if a malteron is on same or adjacent-connected block.
  for (const c of phi.crew ?? []) {
    if (!c.alive) continue;
    const ep = rt.crewPaths.get(c.id);
    if (!ep) continue;
    const shooter = state.players.find(p => p.id === c.shooterId);
    let inputX = 0, inputY = 0;
    // Threat detection: nearest malteron world distance.
    let flee: PhiMalteron | null = null;
    let fd = Infinity;
    for (const m of phi.malterons ?? []) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      if (d < fd) { fd = d; flee = m; }
    }
    if (flee && fd < 220) {
      inputX = c.x - flee.x;
      inputY = c.y - flee.y;
    } else if (shooter && shooter.alive) {
      inputX = shooter.x - c.x;
      inputY = shooter.y - c.y;
    }
    const n = Math.hypot(inputX, inputY) || 1;
    moveEntityAlong(rt, ep, inputX / n, inputY / n, 2.4);
    const b = rt.blocks.find(x => x.id === ep.blockId);
    if (b) {
      const pos = entityWorldPos(b, ep.t);
      c.x = pos.x; c.y = pos.y;
      if (Math.abs(inputX) > 0.1) c.facingX = inputX > 0 ? 1 : -1;
    }
  }

  // Gate all Malteron spawning + AI behind the 10s pre-round countdown.
  const countdownActive = (phi.malteronCountdownUntil ?? 0) > now;
  if (countdownActive) {
    const secsLeft = Math.max(0, Math.ceil(((phi.malteronCountdownUntil ?? 0) - now) / 1000));
    phi.banner = { text: `MALTERON APOCALYPSE BEGINS IN ${secsLeft}…`, until: now + 400 };
    return;
  }
  if (!phi.malteronSpawned) {
    const active = state.players.filter(p => !p.phiEliminated);
    if (active.length > 0) {
      phi.malteronSpawned = true;
      const spawnCount = phi.survivorMode ? Math.max(6, active.length) : active.length;
      for (let i = 0; i < spawnCount; i++) spawnMalteron(state);
      phi.banner = { text: 'MALTERON APOCALYPSE!', until: now + 1500 };
    }
  }
  // Time-sliced Malteron AI: only 4 update per frame (round-robin).
  const malteronList = (phi.malterons ?? []).filter(m => m.alive);
  const AI_BATCH = 4;
  const startIdx = rt.aiCursor % Math.max(1, malteronList.length);
  rt.aiCursor = (rt.aiCursor + AI_BATCH) % Math.max(1, malteronList.length);
  for (let i = 0; i < malteronList.length; i++) {
    const m = malteronList[i];
    const ep = rt.malteronPaths.get(m.id);
    if (!ep) continue;
    const spawnAt = (m as any).spawnAt ?? 0;
    const safe = now - spawnAt < MALTERON_SPAWN_SAFE_MS;
    const activeThisFrame = ((i - startIdx + malteronList.length) % malteronList.length) < AI_BATCH;

    let target: PhiCrew | null = null;
    if (!safe && activeThisFrame) {
      let td = Infinity;
      for (const c of phi.crew ?? []) {
        if (!c.alive) continue;
        // Cheap bounding filter first
        const dxq = c.x - m.x, dyq = c.y - m.y;
        if (Math.abs(dxq) > DETECTION_RADIUS || Math.abs(dyq) > DETECTION_RADIUS) continue;
        const d = Math.hypot(dxq, dyq);
        if (d < DETECTION_RADIUS && d < td) { td = d; target = c; }
      }
    }
    let inputX: number, inputY: number;
    if (target) {
      inputX = target.x - m.x; inputY = target.y - m.y;
    } else if (activeThisFrame) {
      const tan = 1 - Math.abs(ep.t - 0.5) * 2;
      const dir = ep.t < 0.5 ? 1 : -1;
      inputX = dir * (tan + 0.3) + (Math.random() - 0.5) * 0.4;
      inputY = (Math.random() - 0.5) * 0.4;
    } else {
      // Idle carry-along: keep last facing, no computation.
      inputX = m.vx; inputY = m.vy;
    }
    m.vx = inputX; m.vy = inputY;
    const n = Math.hypot(inputX, inputY) || 1;
    moveEntityAlong(rt, ep, inputX / n, inputY / n, activeThisFrame ? 2.0 : 1.2);
    const b = rt.blocks.find(x => x.id === ep.blockId);
    if (b) {
      const pos = entityWorldPos(b, ep.t);
      m.x = pos.x; m.y = pos.y;
      if (Math.abs(inputX) > 0.1) m.facingX = inputX > 0 ? 1 : -1;
    }
    if (target && !safe) {
      m.targetCrewId = target.id;
      if (Math.hypot(m.x - target.x, m.y - target.y) < 26) {
        target.alive = false;
        addCorpse(state, target.x, target.y, 'crew', target.facingX);
        const shooter = state.players.find(p => p.id === target!.shooterId);
        if (shooter && !shooter.phiQualified && !shooter.phiEliminated) {
          shooter.phiEliminated = true;
          shooter.alive = false;
          addCorpse(state, shooter.x, shooter.y, 'player', shooter.facingX ?? 1);
        }
      }
    }
  }

  // Bullet physics + collisions
  tickBullets(state, dt, now, (b) => {
    // Bullets travel only inside the pipes; they cannot cut across rock or
    // jump into a cave that isn't connected to the one they were fired in.
    if (!pointOnPipe(rt, b.x, b.y)) return true;
    for (const m of phi.malterons ?? []) {
      if (!m.alive) continue;
      if (Math.hypot(m.x - b.x, m.y - b.y) < 26) {
        m.alive = false;
        rt.malteronPaths.delete(m.id);
        addCorpse(state, m.x, m.y, 'malteron', m.facingX);
        phi.pendingMalteronSpawns ??= [];
        phi.pendingMalteronSpawns.push(now + 300);
        return true;
      }
    }
    return false;
  });

  if (phi.malteronSpawned && phi.pendingMalteronSpawns?.length) {
    const due = phi.pendingMalteronSpawns.filter(t => t <= now).length;
    phi.pendingMalteronSpawns = phi.pendingMalteronSpawns.filter(t => t > now);
    for (let i = 0; i < due; i++) spawnMalteron(state);
  }

  // Maintain malteron count = active players (or survivor swarm minimum)
  const activeCount = state.players.filter(p => !p.phiEliminated).length;
  if (activeCount > 0 && phi.malteronSpawned) {
    const target = phi.survivorMode ? Math.max(6, activeCount) : activeCount;
    const liveMalterons = (phi.malterons ?? []).filter(m => m.alive).length;
    const pendingMalterons = phi.pendingMalteronSpawns?.length ?? 0;
    if (liveMalterons + pendingMalterons < target) spawnMalteron(state);
  }
}

// ============ Rendering ============

function drawBlock(ctx: CanvasRenderingContext2D, b: Block) {
  const o = blockWorldOrigin(b);
  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(o.x + 6, o.y + 10, BLOCK_SIZE, BLOCK_SIZE);
  // Metallic gradient body
  const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + BLOCK_SIZE);
  g.addColorStop(0, '#4a5a6e');
  g.addColorStop(0.45, '#2b3846');
  g.addColorStop(1, '#131c25');
  ctx.fillStyle = g;
  ctx.fillRect(o.x, o.y, BLOCK_SIZE, BLOCK_SIZE);
  // Bevel highlight
  ctx.strokeStyle = 'rgba(200,220,240,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o.x + 3, o.y + BLOCK_SIZE - 3);
  ctx.lineTo(o.x + 3, o.y + 3);
  ctx.lineTo(o.x + BLOCK_SIZE - 3, o.y + 3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.moveTo(o.x + BLOCK_SIZE - 3, o.y + 3);
  ctx.lineTo(o.x + BLOCK_SIZE - 3, o.y + BLOCK_SIZE - 3);
  ctx.lineTo(o.x + 3, o.y + BLOCK_SIZE - 3);
  ctx.stroke();
  // Rivets
  for (const [dx, dy] of [[14, 14], [BLOCK_SIZE - 14, 14], [14, BLOCK_SIZE - 14], [BLOCK_SIZE - 14, BLOCK_SIZE - 14]]) {
    const rg = ctx.createRadialGradient(o.x + dx - 1, o.y + dy - 1, 0, o.x + dx, o.y + dy, 6);
    rg.addColorStop(0, '#c8d4e0'); rg.addColorStop(1, '#3a4d63');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(o.x + dx - 4, o.y + dy - 1, 8, 2);
  }
  // Cave-like path: deep dark trench + amber rim glow
  const steps = 40;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pathPoint(b.pathType, t);
    pts.push({ x: o.x + p.x, y: o.y + p.y });
  }
  // outer glow border (amber)
  ctx.strokeStyle = 'rgba(255,170,60,0.55)';
  ctx.lineWidth = PATH_HALF_WIDTH * 2 + 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  // cave interior (dark)
  ctx.strokeStyle = '#0b0f14';
  ctx.lineWidth = PATH_HALF_WIDTH * 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  // inner scan-line highlight
  ctx.strokeStyle = 'rgba(255,200,120,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawEmptyCell(ctx: CanvasRenderingContext2D, row: number, col: number) {
  const x = GRID_ORIGIN.x + col * BLOCK_SIZE;
  const y = GRID_ORIGIN.y + row * BLOCK_SIZE;
  ctx.fillStyle = '#050810';
  ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = '#1c2a3a';
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 6, y + 6, BLOCK_SIZE - 12, BLOCK_SIZE - 12);
  ctx.setLineDash([]);
}

function drawMalteronSprite(ctx: CanvasRenderingContext2D, m: PhiMalteron) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(m.x, m.y + 22, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(m.x, m.y);
  if (m.facingX < 0) ctx.scale(-1, 1);
  const size = 58;
  if (MALTERON_IMG.complete && MALTERON_IMG.naturalWidth > 0) {
    ctx.drawImage(MALTERON_IMG, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function renderMalteron(
  ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number,
) {
  const rt = state.phi!.mRuntime;
  if (!rt) return;
  const human = state.players[0];
  const camX = Math.max(0, Math.min(state.mapWidth - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(state.mapHeight - canvasH, human.y - canvasH / 2));

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#0e1a25';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(-camX, -camY);

  // Empty cell(s) — the one hole
  drawEmptyCell(ctx, rt.emptyRow, rt.emptyCol);
  // Blocks
  for (const b of rt.blocks) drawBlock(ctx, b);

  // Crew
  for (const c of state.phi!.crew ?? []) {
    if (!c.alive) continue;
    drawRobot(ctx, {
      x: c.x, y: c.y, dirX: c.facingX, size: 40,
      keyId: `mc-${c.id}`, variant: 'crew',
      label: 'CREW', subLabel: undefined,
    });
  }
  // Malterons
  for (const m of state.phi!.malterons ?? []) {
    if (m.alive) drawMalteronSprite(ctx, m);
  }
  // Shooters (players) with SHOOTER red tag
  for (const p of state.players) {
    if (p.phiEliminated) continue;
    drawRobot(ctx, {
      x: p.x, y: p.y, dirX: p.direction.x, dirY: p.direction.y,
      moving: Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.15,
      keyId: `mp-${p.id}`, variant: 'player',
      label: p.name, subLabel: 'SHOOTER', subColor: '#ff5252',
    });
    // Bullets indicator
    ctx.fillStyle = '#ffd45c';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`● ${p.phiBullets ?? 0}`, p.x, p.y + 34);
  }

  // Corpses, spawn effects, animated bullets
  const now = performance.now();
  renderCorpses(ctx, state, now);
  renderSpawnFx(ctx, state, now);
  renderBullets(ctx, state, now);

  ctx.restore();
}
