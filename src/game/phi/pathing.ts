import PF from 'pathfinding';
import { GameState } from '../types';
import { resolveCollisions } from '../collision';
import type { NeonState } from '../types';

/**
 * Shared A* pathfinding helpers (PathFinding.js) used by the bots so they
 * navigate corridors, doorways and maze walls instead of bumping into them.
 */

const finder = new PF.AStarFinder({
  diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles,
});

// ---------------- Mars (open map with walls / obstacles) ----------------

const MARS_CELL = 40;
let marsGrid: PF.Grid | null = null;
let marsBuiltAt = -Infinity;
let marsW = 0, marsH = 0;

function buildMarsGrid(state: GameState) {
  const cols = Math.ceil(state.mapWidth / MARS_CELL);
  const rows = Math.ceil(state.mapHeight / MARS_CELL);
  const g = new PF.Grid(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * MARS_CELL + MARS_CELL / 2;
      const y = r * MARS_CELL + MARS_CELL / 2;
      const res = resolveCollisions(x, y, state.doors);
      const free = Math.hypot(res.x - x, res.y - y) < 0.5;
      g.setWalkableAt(c, r, free);
    }
  }
  marsGrid = g;
  marsW = cols; marsH = rows;
}

export function invalidateMarsGrid() {
  marsGrid = null;
  marsBuiltAt = -Infinity;
}

function marsGridFor(state: GameState, now: number) {
  // Doors open/close, so refresh periodically.
  if (!marsGrid || now - marsBuiltAt > 1500) {
    buildMarsGrid(state);
    marsBuiltAt = now;
  }
  return marsGrid!;
}

function nearestWalkable(grid: PF.Grid, c: number, r: number) {
  if (grid.isInside(c, r) && grid.isWalkableAt(c, r)) return { c, r };
  for (let rad = 1; rad <= 4; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = c + dc, nr = r + dr;
        if (grid.isInside(nc, nr) && grid.isWalkableAt(nc, nr)) return { c: nc, r: nr };
      }
    }
  }
  return null;
}

/**
 * Direction (unit vector) to follow along an A* path on Mars.
 * Returns null when no path exists (caller can fall back to steering).
 */
export function marsPathDir(
  state: GameState, sx: number, sy: number, tx: number, ty: number, now: number,
): { x: number; y: number } | null {
  const grid = marsGridFor(state, now);
  const s = nearestWalkable(grid, Math.floor(sx / MARS_CELL), Math.floor(sy / MARS_CELL));
  const t = nearestWalkable(grid, Math.floor(tx / MARS_CELL), Math.floor(ty / MARS_CELL));
  if (!s || !t) return null;
  if (s.c === t.c && s.r === t.r) {
    const dx = tx - sx, dy = ty - sy;
    const n = Math.hypot(dx, dy) || 1;
    return { x: dx / n, y: dy / n };
  }
  const path = finder.findPath(s.c, s.r, t.c, t.r, grid.clone());
  if (path.length < 2) return null;
  // Aim a couple of nodes ahead for smoother movement.
  const node = path[Math.min(2, path.length - 1)];
  const gx = node[0] * MARS_CELL + MARS_CELL / 2;
  const gy = node[1] * MARS_CELL + MARS_CELL / 2;
  const dx = gx - sx, dy = gy - sy;
  const n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

// ---------------- Neon maze ----------------

let neonGrid: PF.Grid | null = null;
let neonKey = '';

/**
 * Maze -> grid at double resolution: (2*cols+1) x (2*rows+1). Cell centres are
 * odd indices; the node between two centres is walkable only if no wall.
 */
function buildNeonGrid(neon: NeonState) {
  const gw = neon.cols * 2 + 1;
  const gh = neon.rows * 2 + 1;
  const g = new PF.Grid(gw, gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g.setWalkableAt(x, y, false);
  for (let r = 0; r < neon.rows; r++) {
    for (let c = 0; c < neon.cols; c++) {
      const gx = c * 2 + 1, gy = r * 2 + 1;
      g.setWalkableAt(gx, gy, true);
      const w = neon.maze[r][c].walls;
      if (!w.E && c + 1 < neon.cols) g.setWalkableAt(gx + 1, gy, true);
      if (!w.S && r + 1 < neon.rows) g.setWalkableAt(gx, gy + 1, true);
      if (!w.W && c - 1 >= 0) g.setWalkableAt(gx - 1, gy, true);
      if (!w.N && r - 1 >= 0) g.setWalkableAt(gx, gy - 1, true);
    }
  }
  neonGrid = g;
}

function neonGridFor(neon: NeonState) {
  const key = `${neon.cols}x${neon.rows}:${neon.maze[0][0].walls.E}${neon.maze[neon.rows - 1][neon.cols - 1].walls.W}`;
  if (!neonGrid || neonKey !== key) {
    buildNeonGrid(neon);
    neonKey = key;
  }
  return neonGrid!;
}

export function invalidateNeonGrid() {
  neonGrid = null;
  neonKey = '';
}

function cellOf(neon: NeonState, x: number, y: number) {
  const c = Math.max(0, Math.min(neon.cols - 1, Math.floor((x - neon.originX) / neon.cellSize)));
  const r = Math.max(0, Math.min(neon.rows - 1, Math.floor((y - neon.originY) / neon.cellSize)));
  return { r, c };
}

function centerOf(neon: NeonState, r: number, c: number) {
  return {
    x: neon.originX + c * neon.cellSize + neon.cellSize / 2,
    y: neon.originY + r * neon.cellSize + neon.cellSize / 2,
  };
}

/** Unit direction along the maze path from (sx,sy) toward (tx,ty). */
export function neonPathDir(
  neon: NeonState, sx: number, sy: number, tx: number, ty: number,
): { x: number; y: number } | null {
  const grid = neonGridFor(neon);
  const s = cellOf(neon, sx, sy);
  const t = cellOf(neon, tx, ty);
  if (s.r === t.r && s.c === t.c) {
    const dx = tx - sx, dy = ty - sy;
    const n = Math.hypot(dx, dy) || 1;
    return { x: dx / n, y: dy / n };
  }
  const path = new PF.AStarFinder().findPath(
    s.c * 2 + 1, s.r * 2 + 1, t.c * 2 + 1, t.r * 2 + 1, grid.clone(),
  );
  if (path.length < 2) return null;
  const node = path[1];
  const gx = neon.originX + ((node[0] - 1) / 2) * neon.cellSize + neon.cellSize / 2;
  const gy = neon.originY + ((node[1] - 1) / 2) * neon.cellSize + neon.cellSize / 2;
  const dx = gx - sx, dy = gy - sy;
  const n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

/**
 * Pick the reachable maze cell (within `range` cells) that maximises distance
 * from every danger point — used by bots fleeing the dragon and rings.
 */
export function neonSafestCell(
  neon: NeonState, x: number, y: number, dangers: Array<{ x: number; y: number }>, range = 4,
): { x: number; y: number } | null {
  const here = cellOf(neon, x, y);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let dr = -range; dr <= range; dr++) {
    for (let dc = -range; dc <= range; dc++) {
      const r = here.r + dr, c = here.c + dc;
      if (r < 0 || c < 0 || r >= neon.rows || c >= neon.cols) continue;
      const p = centerOf(neon, r, c);
      let score = 0;
      for (const d of dangers) score += Math.min(600, Math.hypot(p.x - d.x, p.y - d.y));
      score -= (Math.abs(dr) + Math.abs(dc)) * 12; // prefer nearby refuges
      if (score > bestScore) { bestScore = score; best = p; }
    }
  }
  return best;
}
