import { GameState, PLAYER_RADIUS, NeonMazeCell, NeonState, NeonColor, NeonRing, NeonDragon } from '../types';
import { drawRobot } from './robot';
import { addCorpse, renderCorpses, renderSpawnFx, PERSONALITY, viewPlayer, awardXP } from './shared';
import {
  FloorSpace, tickBubbles, renderBubbles, renderPlayerStatus, bubbleSteer,
  hitPlayer, effSpeed, isFrozen,
} from './bubbles';

const COLS = 22;
const ROWS = 14;
const CELL = 104;
const WALL_LW = 6;
const MAP_W = COLS * CELL + 40;
const MAP_H = ROWS * CELL + 40;
const ORIGIN_X = 20;
const ORIGIN_Y = 20;
const VISION_RADIUS = 380;
const DANGER_CONTACT_WIDTH = PLAYER_RADIUS + 8;
const FREQUENCY_INTERCEPT_WIDTH = 14;

const COLORS: NeonColor[] = ['GREEN', 'WHITE', 'BLUE', 'RED'];
const COLOR_HEX: Record<NeonColor, string> = {
  GREEN: '#5fff8a', WHITE: '#f5f7ff', BLUE: '#57b8ff', RED: '#ff5a6b',
};

// -------- Maze generation --------
function newMaze(): NeonMazeCell[][] {
  const m: NeonMazeCell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    m[r] = [];
    for (let c = 0; c < COLS; c++) {
      m[r][c] = { r, c, walls: { N: true, E: true, S: true, W: true } };
    }
  }
  const inb = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const opp: Record<string, 'N' | 'E' | 'S' | 'W'> = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const dxy: Record<'N' | 'E' | 'S' | 'W', [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const stack: [number, number][] = [[0, 0]];
  const visited = new Set<string>(['0,0']);
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const dirs = (['N', 'E', 'S', 'W'] as Array<'N' | 'E' | 'S' | 'W'>).slice().sort(() => Math.random() - 0.5);
    let carved = false;
    for (const d of dirs) {
      const [dr, dc] = dxy[d];
      const nr = r + dr, nc = c + dc;
      if (!inb(nr, nc)) continue;
      if (visited.has(`${nr},${nc}`)) continue;
      m[r][c].walls[d] = false;
      m[nr][nc].walls[opp[d]] = false;
      visited.add(`${nr},${nc}`);
      stack.push([nr, nc]);
      carved = true; break;
    }
    if (!carved) stack.pop();
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = m[r][c];
    const wallSides = (['N', 'E', 'S', 'W'] as Array<'N' | 'E' | 'S' | 'W'>).filter(d => cell.walls[d]);
    if (wallSides.length >= 3) {
      const avail = wallSides.filter(d => {
        const [dr, dc] = dxy[d];
        return inb(r + dr, c + dc);
      });
      if (!avail.length) continue;
      const pick = avail[Math.floor(Math.random() * avail.length)];
      const [dr, dc] = dxy[pick];
      cell.walls[pick] = false;
      m[r + dr][c + dc].walls[opp[pick]] = false;
    }
  }
  return m;
}

function cellCenter(r: number, c: number) {
  return { x: ORIGIN_X + c * CELL + CELL / 2, y: ORIGIN_Y + r * CELL + CELL / 2 };
}

function shuffleMapping(): Record<'2' | '3' | '4' | '5', NeonColor> {
  const shuf = [...COLORS].sort(() => Math.random() - 0.5);
  return { '2': shuf[0], '3': shuf[1], '4': shuf[2], '5': shuf[3] };
}

export function initNeonFloor(state: GameState) {
  state.mapWidth = MAP_W;
  state.mapHeight = MAP_H;
  state.taskStations = [];
  state.doors = [];
  state.powerups = [];
  state.projectiles = [];
  state.platforms = [];

  const maze = newMaze();
  const mapping = shuffleMapping();
  const colorToKey: Record<NeonColor, '2' | '3' | '4' | '5'> = {} as any;
  (['2', '3', '4', '5'] as const).forEach(k => (colorToKey[mapping[k]] = k));

  const startR = Math.floor(ROWS / 2), startC = Math.floor(COLS / 2);
  const head = cellCenter(startR, startC);
  const dragon: NeonDragon = {
    segments: Array.from({ length: 40 }, () => ({ x: head.x, y: head.y })),
    headCell: { r: startR, c: startC },
    dir: 'E',
    cellProgress: 0,
  };

  const neon: NeonState = {
    maze, cols: COLS, rows: ROWS, cellSize: CELL,
    originX: ORIGIN_X, originY: ORIGIN_Y,
    dragon,
    rings: [], nextRingId: 1,
    mapping, colorToKey,
    nextEventAt: performance.now() + 2500,
    pausedUntil: 0,
    patternStep: 0,
    perPlayer: new Map(),
  };
  state.phi!.neon = neon;

  // Randomised spawns across all cells so each player begins in a
  // different spot every match.
  const active = state.players.filter(p => !p.phiEliminated);
  const allCells: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) allCells.push([r, c]);
  allCells.sort(() => Math.random() - 0.5);
  active.forEach((p, i) => {
    const [r, c] = allCells[i % allCells.length];
    const pos = cellCenter(r, c);
    p.x = pos.x; p.y = pos.y;
    p.direction = { x: 0, y: 0 };
    p.neonImmuneColor = undefined;
    p.neonImmuneUntil = 0;
    p.phiHeat = 0;
    p.phiLastEmitAt = undefined;

  });
}

// ---- Dragon walk ----
const OPP: Record<'N' | 'E' | 'S' | 'W', 'N' | 'E' | 'S' | 'W'> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIR_DXY: Record<'N' | 'E' | 'S' | 'W', [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

function pickDragonDir(neon: NeonState): 'N' | 'E' | 'S' | 'W' {
  const cell = neon.maze[neon.dragon.headCell.r][neon.dragon.headCell.c];
  const opts = (['N', 'E', 'S', 'W'] as Array<'N' | 'E' | 'S' | 'W'>).filter(d => !cell.walls[d]);
  const forward = opts.filter(d => d !== OPP[neon.dragon.dir]);
  const pool = forward.length ? forward : opts;
  return pool[Math.floor(Math.random() * pool.length)] ?? neon.dragon.dir;
}

function tickDragon(state: GameState, dt: number) {
  const neon = state.phi!.neon!;
  const d = neon.dragon;
  const speed = 5.0 / 1000; // cells per ms — faster, scarier
  d.cellProgress += speed * dt;

  const curCenter = cellCenter(d.headCell.r, d.headCell.c);
  const [dr, dc] = DIR_DXY[d.dir];
  const nextR = d.headCell.r + dr, nextC = d.headCell.c + dc;
  const nextCenter = cellCenter(nextR, nextC);

  let hx: number, hy: number;
  if (d.cellProgress >= 1) {
    d.headCell.r = nextR; d.headCell.c = nextC;
    d.cellProgress = 0;
    d.dir = pickDragonDir(neon);
    const c2 = cellCenter(d.headCell.r, d.headCell.c);
    hx = c2.x; hy = c2.y;
  } else {
    hx = curCenter.x + (nextCenter.x - curCenter.x) * d.cellProgress;
    hy = curCenter.y + (nextCenter.y - curCenter.y) * d.cellProgress;
  }
  for (let i = d.segments.length - 1; i > 0; i--) {
    const target = d.segments[i - 1];
    const seg = d.segments[i];
    seg.x += (target.x - seg.x) * 0.42;
    seg.y += (target.y - seg.y) * 0.42;
  }
  d.segments[0].x = hx;
  d.segments[0].y = hy;
}

// ---- Frequency events with quadrant placement + overlap rule ----
function pickCellForEvent(state: GameState, now: number): { r: number; c: number; quadrant: number } {
  const neon = state.phi!.neon!;
  const quadCounts = [0, 0, 0, 0];
  const activeEvents = neon.rings.filter(r => r.isEvent && r.radius < r.maxRadius);
  for (const r of activeEvents) quadCounts[r.quadrant ?? 0]++;
  let targetQuad = 0;
  let minC = quadCounts[0];
  for (let q = 1; q < 4; q++) if (quadCounts[q] < minC) { minC = quadCounts[q]; targetQuad = q; }
  const qc = Math.floor(COLS / 2), qr = Math.floor(ROWS / 2);
  const cMin = (targetQuad % 2) * qc;
  const cMax = cMin + qc;
  const rMin = Math.floor(targetQuad / 2) * qr;
  const rMax = rMin + qr;

  // Try many candidates; accept when far from other event centers OR inside one.
  for (let attempt = 0; attempt < 20; attempt++) {
    const rr = rMin + Math.floor(Math.random() * Math.max(1, rMax - rMin));
    const cc = cMin + Math.floor(Math.random() * Math.max(1, cMax - cMin));
    const p = cellCenter(rr, cc);
    let ok = true;
    for (const ev of activeEvents) {
      const dist = Math.hypot(ev.x - p.x, ev.y - p.y);
      const insideOther = dist < ev.radius;
      const tooClose = dist < CELL * 3;
      if (tooClose && !insideOther) { ok = false; break; }
    }
    if (ok) return { r: rr, c: cc, quadrant: targetQuad };
  }
  // Fallback random cell
  return {
    r: Math.floor(Math.random() * ROWS),
    c: Math.floor(Math.random() * COLS),
    quadrant: targetQuad,
  };
}

function spawnEvent(state: GameState, now: number) {
  const neon = state.phi!.neon!;
  if (neon.rings.filter(r => r.isEvent).length >= 12) {
    neon.pausedUntil = now + 3500;
    return;
  }
  const pick = pickCellForEvent(state, now);
  const p = cellCenter(pick.r, pick.c);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const ring: NeonRing = {
    id: neon.nextRingId++,
    x: p.x, y: p.y,
    color,
    radius: 8,
    maxRadius: 420,
    growSpeed: 0.06,
    spawnedAt: now,
    hitPlayers: new Set(),
    consumedBy: new Set(),
    quadrant: pick.quadrant,
    isEvent: true,
  };
  neon.rings.push(ring);
}

function scheduleNext(neon: NeonState, now: number) {
  const isPattern = neon.patternStep % 2 === 0;
  neon.nextEventAt = now + (isPattern ? 1600 : 2600 + Math.random() * 1400);
  neon.patternStep++;
}

function emitPlayerRing(state: GameState, playerId: number, color: NeonColor, x: number, y: number, now: number) {
  const neon = state.phi!.neon!;
  const ring: NeonRing = {
    id: neon.nextRingId++,
    x, y, color,
    radius: 6, maxRadius: 260, growSpeed: 0.08,
    spawnedAt: now,
    ownerId: playerId,
    hitPlayers: new Set(),
    isEvent: false,
  };
  neon.rings.push(ring);
}

/** Body margin used against maze walls so players cannot overlap/climb them. */
const WALL_MARGIN = PLAYER_RADIUS + WALL_LW / 2;

function cellOf(x: number, y: number) {
  return { c: Math.floor((x - ORIGIN_X) / CELL), r: Math.floor((y - ORIGIN_Y) / CELL) };
}

/**
 * Push a position out of any wall of the cell it currently occupies.
 * Runs a couple of iterations so corners resolve cleanly.
 */
function clampToMaze(state: GameState, x: number, y: number): { x: number; y: number } {
  const neon = state.phi!.neon!;
  const minX = ORIGIN_X + WALL_MARGIN, maxX = ORIGIN_X + COLS * CELL - WALL_MARGIN;
  const minY = ORIGIN_Y + WALL_MARGIN, maxY = ORIGIN_Y + ROWS * CELL - WALL_MARGIN;
  x = Math.max(minX, Math.min(maxX, x));
  y = Math.max(minY, Math.min(maxY, y));
  for (let i = 0; i < 2; i++) {
    const { r, c } = cellOf(x, y);
    const cell = neon.maze[Math.max(0, Math.min(ROWS - 1, r))]?.[Math.max(0, Math.min(COLS - 1, c))];
    if (!cell) break;
    const left = ORIGIN_X + cell.c * CELL;
    const top = ORIGIN_Y + cell.r * CELL;
    if (cell.walls.W) x = Math.max(x, left + WALL_MARGIN);
    if (cell.walls.E) x = Math.min(x, left + CELL - WALL_MARGIN);
    if (cell.walls.N) y = Math.max(y, top + WALL_MARGIN);
    if (cell.walls.S) y = Math.min(y, top + CELL - WALL_MARGIN);
  }
  return { x, y };
}

/** Move with sub-steps so fast movement can never tunnel through a wall. */
function moveWithWalls(state: GameState, x: number, y: number, dx: number, dy: number) {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (WALL_MARGIN * 0.5)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    let nx = x + sx;
    let c1 = clampToMaze(state, nx, y);
    x = c1.x; y = c1.y;
    let ny = y + sy;
    let c2 = clampToMaze(state, x, ny);
    x = c2.x; y = c2.y;
  }
  return { x, y };
}

/** Walkable space in the maze: cell interiors, away from the dragon. */
function neonSpace(state: GameState): FloorSpace {
  const neon = state.phi!.neon!;
  const clear = (x: number, y: number) => {
    const c = clampToMaze(state, x, y);
    if (Math.hypot(c.x - x, c.y - y) > 0.5) return false;
    for (const s of neon.dragon.segments) if (Math.hypot(s.x - x, s.y - y) < 120) return false;
    return true;
  };
  return {
    walkable: clear,
    randomPoint: () => {
      for (let i = 0; i < 80; i++) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);
        const p = cellCenter(r, c);
        if (clear(p.x, p.y)) return p;
      }
      return null;
    },
  };
}




/** Heat added per frequency emit, and passive cooling rate (per ms). */
const HEAT_PER_EMIT = 0.3;
export const HEAT_COOL_PER_MS = 0.16 / 1000;
export const HEAT_WARN = 0.75;

function addHeat(p: { phiHeat?: number; phiLastEmitAt?: number }, now: number) {
  // Rapid consecutive taps stack harder than spaced-out, deliberate ones.
  const since = now - (p.phiLastEmitAt ?? -Infinity);
  const burst = since < 600 ? 1.5 : since < 1200 ? 1.1 : 0.8;
  p.phiHeat = Math.min(1.2, (p.phiHeat ?? 0) + HEAT_PER_EMIT * burst);
  p.phiLastEmitAt = now;
}

export function tickNeon(state: GameState, dt: number, keys: Set<string>, now: number, isMobile: boolean) {
  const neon = state.phi!.neon;
  if (!neon) return;
  tickDragon(state, dt);

  const space = neonSpace(state);
  tickBubbles(state, now, space);
  const strike = (p: typeof state.players[number]) => hitPlayer(state, p, space, now);

  if (now >= neon.pausedUntil && now >= neon.nextEventAt) {
    spawnEvent(state, now);
    scheduleNext(neon, now);
  }

  const human = state.players[0];
  if (human.alive && !human.phiEliminated && !human.phiQualified && !isFrozen(human, now)) {
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
    for (const k of ['2', '3', '4', '5'] as const) {
      if (keys.has(k)) {
        const color = neon.mapping[k];
        human.neonImmuneColor = color;
        human.neonImmuneUntil = now + 1400;
        emitPlayerRing(state, human.id, color, human.x, human.y, now);
        addHeat(human, now);
        keys.delete(k);
      }
    }
  }

  for (const p of state.players) {
    if (p.isHuman || p.phiEliminated || p.phiQualified) continue;
    if (isFrozen(p, now)) { p.direction = { x: 0, y: 0 }; continue; }
    const cfg = PERSONALITY[p.botPersonality ?? 'B'];
    let nearest = Infinity;
    for (const s of neon.dragon.segments) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < nearest) nearest = d;
    }
    let flee = { x: 0, y: 0 };
    if (nearest < 180) {
      flee.x += (p.x - neon.dragon.segments[0].x);
      flee.y += (p.y - neon.dragon.segments[0].y);
    }
    for (const r of neon.rings) {
      if (!r.isEvent) continue;
      const dc = Math.hypot(r.x - p.x, r.y - p.y);
      if (dc < r.radius + 100 && dc < 260) {
        if (!(p.neonImmuneColor === r.color && (p.neonImmuneUntil ?? 0) > now)) {
          // Bots respect the overheat rule: they hold fire when hot.
          const hot = (p.phiHeat ?? 0) > 0.62;
          if (!hot && Math.random() < 0.4 + cfg.riskThreshold) {
            p.neonImmuneColor = r.color;
            p.neonImmuneUntil = now + 1400;
            emitPlayerRing(state, p.id, r.color, p.x, p.y, now);
            addHeat(p, now);
          }
          flee.x += (p.x - r.x) * 0.6;
          flee.y += (p.y - r.y) * 0.6;
        }
      }
    }
    const bub = bubbleSteer(state, p, now);
    if (bub.weight > 0) {
      const w = (flee.x === 0 && flee.y === 0) ? 1 : (p.enhanced ? 0.7 : 0.45);
      flee.x += bub.x * w * 120;
      flee.y += bub.y * w * 120;
    }
    if (flee.x === 0 && flee.y === 0) {
      p.direction.x += (Math.random() - 0.5) * cfg.wanderNoise;
      p.direction.y += (Math.random() - 0.5) * cfg.wanderNoise;
      const n = Math.hypot(p.direction.x, p.direction.y) || 1;
      p.direction.x /= n; p.direction.y /= n;
    } else {
      const n = Math.hypot(flee.x, flee.y) || 1;
      p.direction.x = flee.x / n; p.direction.y = flee.y / n;
    }
  }

  // --- System heat: cool down, and kill anyone who pushes past the red. ---
  for (const p of state.players) {
    if (p.phiEliminated) continue;
    const heat = p.phiHeat ?? 0;
    if (heat > 0) {
      p.phiHeat = Math.max(0, heat - HEAT_COOL_PER_MS * dt);
    }
    if ((p.phiHeat ?? 0) >= 1) {
      p.phiHeat = 0;
      strike(p);
    }
  }


  const ALIVE = state.players.filter(p => !p.phiEliminated);
  for (const p of ALIVE) {
    if (p.phiQualified) continue;
    const speed = effSpeed(p, now);
    const moved = moveWithWalls(state, p.x, p.y, p.direction.x * speed, p.direction.y * speed);
    p.x = moved.x;
    p.y = moved.y;
    if (Math.abs(p.direction.x) > 0.1) p.facingX = p.direction.x;
  }
  for (let i = 0; i < ALIVE.length; i++) {
    for (let j = i + 1; j < ALIVE.length; j++) {
      const a = ALIVE[i], b = ALIVE[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = PLAYER_RADIUS * 2;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
  // Separation must never shove anyone inside a wall.
  for (const p of ALIVE) {
    if (p.phiQualified) continue;
    const fixed = clampToMaze(state, p.x, p.y);
    p.x = fixed.x; p.y = fixed.y;
  }

  for (const r of neon.rings) {
    r.prevRadius = r.radius;
    r.radius += r.growSpeed * dt;
  }
  neon.rings = neon.rings.filter(r => r.radius < r.maxRadius);

  const consumedGeneratedRingIds = new Set<number>();

  // Per-player frequency resolution: the earliest event wins.
  // A matching player-emitted ring can intercept an incoming frequency
  // before it reaches the player. If the incoming edge reaches the player
  // first, the player dies. Successful protection clears the generated
  // ring and ignores every frequency already active on the map for that
  // player, so later overlap from the same wave cannot kill them.
  for (const p of ALIVE) {
    if (p.phiQualified) continue;

    // Post-save grace: after a successful protection, any further rings
    // that touch the player are ignored (only for the grace window).
    if ((p.phiProtectedUntil ?? 0) > now) {
      const contacts = neon.rings
        .filter(r => r.isEvent && !(r.consumedBy?.has(p.id)) && !r.hitPlayers.has(p.id))
        .map(r => ({ r, d: Math.hypot(r.x - p.x, r.y - p.y) }))
        .filter(({ r, d }) => Math.abs(d - r.radius) < DANGER_CONTACT_WIDTH);
      for (const c of contacts) c.r.hitPlayers.add(p.id);
      continue;
    }

    const eventRings = neon.rings.filter(r => r.isEvent && !(r.consumedBy?.has(p.id)) && !r.hitPlayers.has(p.id));
    const playerRings = neon.rings.filter(r => !r.isEvent && r.ownerId === p.id && !consumedGeneratedRingIds.has(r.id));
    let firstDanger: { ring: NeonRing; t: number } | null = null;
    for (const r of eventRings) {
      const d = Math.hypot(r.x - p.x, r.y - p.y);
      const prev = r.prevRadius ?? r.radius;
      const delta = Math.max(0.0001, r.radius - prev);
      const edgeNow = Math.abs(d - r.radius) < DANGER_CONTACT_WIDTH;
      const crossedThisFrame = prev < d - DANGER_CONTACT_WIDTH && r.radius >= d - DANGER_CONTACT_WIDTH;
      if (!edgeNow && !crossedThisFrame) continue;
      const t = crossedThisFrame ? Math.max(0, Math.min(1, (d - DANGER_CONTACT_WIDTH - prev) / delta)) : 0;
      if (!firstDanger || t < firstDanger.t) firstDanger = { ring: r, t };
    }

    let firstSave: { eventRing: NeonRing; playerRing: NeonRing; t: number } | null = null;
    for (const eventRing of eventRings) {
      for (const playerRing of playerRings) {
        if (playerRing.color !== eventRing.color) continue;
        const d = Math.hypot(eventRing.x - playerRing.x, eventRing.y - playerRing.y);
        const prevSum = (eventRing.prevRadius ?? eventRing.radius) + (playerRing.prevRadius ?? playerRing.radius);
        const sum = eventRing.radius + playerRing.radius;
        const delta = Math.max(0.0001, sum - prevSum);
        const touchingNow = d <= sum + FREQUENCY_INTERCEPT_WIDTH;
        const crossedThisFrame = prevSum < d - FREQUENCY_INTERCEPT_WIDTH && sum >= d - FREQUENCY_INTERCEPT_WIDTH;
        if (!touchingNow && !crossedThisFrame) continue;
        const t = crossedThisFrame ? Math.max(0, Math.min(1, (d - FREQUENCY_INTERCEPT_WIDTH - prevSum) / delta)) : 0;
        if (!firstSave || t < firstSave.t) firstSave = { eventRing, playerRing, t };
      }
    }

    const immuneDangerMatch = firstDanger && p.neonImmuneColor === firstDanger.ring.color && (p.neonImmuneUntil ?? 0) > now;
    const saveWins = firstSave && (!firstDanger || firstSave.t <= firstDanger.t || firstSave.eventRing.id === firstDanger.ring.id);

    if (saveWins || immuneDangerMatch) {
      const savedRing = firstSave?.eventRing ?? firstDanger!.ring;
      savedRing.consumedBy ??= new Set();
      savedRing.consumedBy.add(p.id);
      savedRing.hitPlayers.add(p.id);
      if (firstSave) consumedGeneratedRingIds.add(firstSave.playerRing.id);
      p.neonImmuneColor = undefined;
      p.neonImmuneUntil = 0;
      p.phiProtectedUntil = now + 1200;
      // +1 XP for releasing the correct frequency against an incoming wave.
      awardXP(p, 1);
      for (const r of eventRings) r.hitPlayers.add(p.id);
    } else if (firstDanger) {
      // Wrong frequency reaches first → die (covers both "no protection"
      // and "player emitted the wrong color and it met a wrong ring first").
      strike(p);
    }
  }
  if (consumedGeneratedRingIds.size > 0) {
    neon.rings = neon.rings.filter(r => !consumedGeneratedRingIds.has(r.id));
  }

  for (const p of ALIVE) {
    if (p.phiQualified) continue;
    for (const s of neon.dragon.segments) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 22 + PLAYER_RADIUS - 4) {
        if ((p.phiProtectedUntil ?? 0) > now) break;
        strike(p);
        break;
      }
    }
  }
}

// ---- Rendering ----
function drawMaze(ctx: CanvasRenderingContext2D, neon: NeonState) {
  ctx.fillStyle = '#020204';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = '#00e5ff';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = WALL_LW;
  ctx.lineCap = 'round';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = neon.maze[r][c];
    const x = ORIGIN_X + c * CELL;
    const y = ORIGIN_Y + r * CELL;
    ctx.beginPath();
    if (cell.walls.N) { ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); }
    if (cell.walls.W) { ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); }
    if (r === ROWS - 1 && cell.walls.S) { ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); }
    if (c === COLS - 1 && cell.walls.E) { ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
}

function drawDragonSegment(
  ctx: CanvasRenderingContext2D, s: { x: number; y: number }, next: { x: number; y: number },
  index: number, total: number,
) {
  const angle = Math.atan2(next.y - s.y, next.x - s.x);
  const t = 1 - index / total;
  const rad = 14 + t * 12;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  // Ember trail (behind segment)
  const glow = ctx.createRadialGradient(0, 0, rad * 0.4, 0, 0, rad * 2.2);
  glow.addColorStop(0, 'rgba(255,50,50,0.55)');
  glow.addColorStop(1, 'rgba(255,20,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, rad * 2.2, 0, Math.PI * 2); ctx.fill();
  // Armor body (grey metallic)
  const body = ctx.createLinearGradient(0, -rad, 0, rad);
  body.addColorStop(0, '#54595f');
  body.addColorStop(0.5, '#2b2f33');
  body.addColorStop(1, '#111214');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0a0a0b';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Red chevron mark
  ctx.strokeStyle = '#ff2233';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-rad * 0.55, -rad * 0.4);
  ctx.lineTo(-rad * 0.15, 0);
  ctx.lineTo(-rad * 0.55, rad * 0.4);
  ctx.stroke();
  // Spikes (top + bottom)
  ctx.fillStyle = '#1a1c1f';
  ctx.beginPath();
  ctx.moveTo(-rad * 0.6, -rad); ctx.lineTo(0, -rad * 1.6); ctx.lineTo(rad * 0.6, -rad);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-rad * 0.6, rad); ctx.lineTo(0, rad * 1.6); ctx.lineTo(rad * 0.6, rad);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDragonHead(ctx: CanvasRenderingContext2D, s: { x: number; y: number }, angle: number) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  // Fiery aura
  const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 56);
  glow.addColorStop(0, 'rgba(255,80,60,0.75)');
  glow.addColorStop(1, 'rgba(255,20,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();
  // Skull silhouette
  ctx.fillStyle = '#1a1c1f';
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(6, -18);
  ctx.lineTo(-18, -14);
  ctx.lineTo(-20, 14);
  ctx.lineTo(6, 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = 2; ctx.stroke();
  // Front spikes
  ctx.fillStyle = '#0e1013';
  for (const [ox, oy] of [[26, 0], [18, -12], [18, 12]]) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + 14, oy);
    ctx.lineTo(ox, oy - 4);
    ctx.closePath();
    ctx.fill();
  }
  // Red eyes
  ctx.fillStyle = '#ff1a2b';
  ctx.shadowColor = '#ff2233'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(2, -7, 5, 2.4, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2, 7, 5, 2.4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawDragon(ctx: CanvasRenderingContext2D, d: NeonDragon) {
  for (let i = d.segments.length - 1; i > 0; i--) {
    drawDragonSegment(ctx, d.segments[i], d.segments[i - 1], i, d.segments.length);
  }
  const head = d.segments[0];
  const next = d.segments[1] ?? head;
  const angle = Math.atan2(head.y - next.y, head.x - next.x);
  drawDragonHead(ctx, head, angle);
}

function drawRings(ctx: CanvasRenderingContext2D, neon: NeonState) {
  ctx.globalCompositeOperation = 'lighter';
  for (const r of neon.rings) {
    ctx.strokeStyle = COLOR_HEX[r.color];
    ctx.lineWidth = r.isEvent ? 7 : 3;
    ctx.globalAlpha = Math.max(0.2, 1 - r.radius / r.maxRadius);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = r.isEvent ? 16 : 8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Vision mask: darken everything except a soft circle around the human. */
function applyVisionMask(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createRadialGradient(cx, cy, VISION_RADIUS * 0.72, cx, cy, VISION_RADIUS);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.82, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function renderNeon(ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number) {
  const neon = state.phi!.neon;
  if (!neon) return;
  const human = viewPlayer(state);
  const camX = Math.max(0, Math.min(MAP_W - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(MAP_H - canvasH, human.y - canvasH / 2));

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);
  // Dark base
  ctx.fillStyle = '#010104';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // --- Off-screen layer for fog-of-war content (maze, dragon, players, teammates) ---
  const off = document.createElement('canvas');
  off.width = canvasW; off.height = canvasH;
  const octx = off.getContext('2d')!;
  octx.save();
  octx.translate(-camX, -camY);
  drawMaze(octx, neon);
  drawDragon(octx, neon.dragon);
  renderBubbles(octx, state, performance.now());
  for (const p of state.players) {
    if (p.phiEliminated) continue;
    drawRobot(octx, {
      x: p.x, y: p.y,
      dirX: p.direction.x, dirY: p.direction.y,
      moving: Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.15,
      keyId: `neon-${p.id}`,
      label: p.name,
    });
  }
  renderPlayerStatus(octx, state, performance.now());
  renderCorpses(octx, state, performance.now());
  renderSpawnFx(octx, state, performance.now());

  octx.restore();
  // Apply vision mask in SCREEN space, centred on the human.
  const hx = human.x - camX, hy = human.y - camY;
  applyVisionMask(octx, hx, hy, canvasW, canvasH);

  // Blit masked content
  ctx.drawImage(off, 0, 0);

  // --- Rings always visible on top ---
  ctx.save();
  ctx.translate(-camX, -camY);
  drawRings(ctx, neon);
  ctx.restore();

  // Keep the main character readable even when rings and fog overlap.
  if (!human.phiEliminated) {
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    drawRobot(ctx, {
      x: human.x, y: human.y,
      dirX: human.direction.x, dirY: human.direction.y,
      moving: Math.abs(human.direction.x) + Math.abs(human.direction.y) > 0.15,
      keyId: `neon-human-${human.id}`,
      label: human.name,
    });
    ctx.restore();
  }

  // Vision-edge vignette
  const vg = ctx.createRadialGradient(hx, hy, VISION_RADIUS * 0.95, hx, hy, VISION_RADIUS * 1.55);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.restore();
}
