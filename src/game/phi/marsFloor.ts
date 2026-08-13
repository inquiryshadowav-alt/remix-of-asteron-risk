import { GameState, Player, PLAYER_RADIUS, TASK_RANGE, TaskStation, MAP_WIDTH, MAP_HEIGHT } from '../types';
import { createTaskStations } from '../tasks';
import { resolveCollisions, createDoors } from '../collision';
import { getNavigationDirection } from '../navigation';
import {
  FloorSpace, tickBubbles, bubbleSteer, effSpeed, isFrozen,
} from './bubbles';

/** Walkable space on Mars: inside bounds and clear of walls/obstacles. */
export function marsSpace(state: GameState): FloorSpace {
  const walkable = (x: number, y: number) => {
    if (x < PLAYER_RADIUS + 10 || y < PLAYER_RADIUS + 10) return false;
    if (x > state.mapWidth - PLAYER_RADIUS - 10 || y > state.mapHeight - PLAYER_RADIUS - 10) return false;
    const r = resolveCollisions(x, y, state.doors);
    return Math.hypot(r.x - x, r.y - y) < 0.5;
  };
  return {
    walkable,
    randomPoint: () => {
      for (let i = 0; i < 120; i++) {
        const x = 60 + Math.random() * (state.mapWidth - 120);
        const y = 60 + Math.random() * (state.mapHeight - 120);
        if (walkable(x, y)) return { x, y };
      }
      return null;
    },
  };
}

/**
 * Bots never body-slam walls: if the desired heading is blocked, fan out to
 * the closest free heading (which naturally funnels them through doorways).
 */
function steerAroundWalls(
  state: GameState, p: Player, dir: { x: number; y: number }, speed: number,
): { x: number; y: number } {
  const probe = Math.max(speed * 3, 22);
  const free = (dx: number, dy: number) => {
    const nx = p.x + dx * probe, ny = p.y + dy * probe;
    const r = resolveCollisions(nx, ny, state.doors);
    return Math.hypot(r.x - nx, r.y - ny) < 0.5;
  };
  if (free(dir.x, dir.y)) return dir;
  for (const a of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
    const cos = Math.cos(a), sin = Math.sin(a);
    const dx = dir.x * cos - dir.y * sin;
    const dy = dir.x * sin + dir.y * cos;
    if (free(dx, dy)) return { x: dx, y: dy };
  }
  return dir;
}


/** Mars floor: complete 3 tasks. No combat, no jail. Player count × 2 task stations. */
export function initMarsFloor(state: GameState) {
  state.mapWidth = MAP_WIDTH;
  state.mapHeight = MAP_HEIGHT;
  state.doors = createDoors();
  state.powerups = [];
  state.projectiles = [];
  state.platforms = [];
  const pc = state.players.length;
  // Survivor mode: fixed pool of 5 stations, player must complete 3 within
  // the timer. Competition mode: pc*2 stations, first to 3 tasks qualifies.
  const survivor = !!state.phi?.survivorMode;
  const total = survivor ? 5 : pc * 2;
  // All stations belong to team 0 (single crew faction).
  const stations = createTaskStations(total, 0 as any, 1);
  state.taskStations = stations;
  state.totalTasks = stations.length;
  state.tasksCompleted = 0;
  // Reset player positions to Mars-safe spawns (shuffled each match).
  const spawns: Array<[number, number]> = ([
    [200, 200], [1800, 200], [200, 1000], [1800, 1000],
    [800, 300], [1000, 900], [400, 600], [1600, 600],
    [600, 800], [1400, 200], [1200, 1100], [300, 900],
    [1700, 800], [900, 500], [500, 400],
  ] as Array<[number, number]>).sort(() => Math.random() - 0.5);
  state.players.forEach((p, i) => {
    if (p.phiEliminated) return;
    const [sx, sy] = spawns[i % spawns.length];
    p.x = sx; p.y = sy;
    p.direction = { x: 0, y: 0 };
    p.doingTask = false;
    p.taskStationId = null;
    p.taskProgress = 0;
  });
}

function nearestIncompleteTask(p: Player, state: GameState): TaskStation | null {
  let best: TaskStation | null = null;
  let bestD = Infinity;
  for (const s of state.taskStations) {
    if (s.completed) continue;
    // Skip stations already claimed by another bot
    const claimed = state.players.some(o => o.id !== p.id && o.doingTask && o.taskStationId === s.id);
    if (claimed) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function tickMars(
  state: GameState, dt: number, keys: Set<string>, now: number, isMobile: boolean,
) {
  const human = state.players[0];
  const space = marsSpace(state);
  tickBubbles(state, now, space);

  // Human keyboard input — qualified players may keep playing (do more tasks).
  if (human.alive && !human.phiEliminated && !human.doingTask && !isFrozen(human, now)) {
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
  } else if (human.doingTask) {
    human.direction = { x: 0, y: 0 };
  }

  for (const p of state.players) {
    if (p.phiEliminated) continue;
    const frozen = isFrozen(p, now);
    if (frozen) {
      p.direction = { x: 0, y: 0 };
      p.doingTask = false;
      p.taskStationId = null;
    }
    // Qualified bots stop competing (leave remaining tasks for others).
    if (!frozen && !p.isHuman && !p.doingTask && !p.phiQualified) {
      const target = nearestIncompleteTask(p, state);
      const bub = bubbleSteer(state, p, now);
      // Enhanced bots value the win (and health pickups) above all else;
      // normal bots put staying safe first, so freeze avoidance dominates.
      const chaseBubble = bub.weight > (p.enhanced ? 0.85 : 0.45);
      if (target && !chaseBubble) {
        const d = Math.hypot(target.x - p.x, target.y - p.y);
        if (d < TASK_RANGE * 0.6) {
          p.doingTask = true;
          p.taskStationId = target.id;
          p.taskProgress = 0;
          p.direction = { x: 0, y: 0 };
        } else {
          const nav = getNavigationDirection(p.x, p.y, target.x, target.y);
          let dx = nav.x, dy = nav.y;
          if (bub.weight > 0) { dx += bub.x * bub.weight * 0.8; dy += bub.y * bub.weight * 0.8; }
          const n = Math.hypot(dx, dy) || 1;
          p.direction = steerAroundWalls(state, p, { x: dx / n, y: dy / n }, p.speed);
        }
      } else if (bub.weight > 0) {
        p.direction = steerAroundWalls(state, p, { x: bub.x, y: bub.y }, p.speed);
      } else {
        p.direction = { x: 0, y: 0 };
      }
    } else if (!frozen && !p.isHuman && p.phiQualified) {
      const bub = bubbleSteer(state, p, now);
      p.direction = bub.weight > 0
        ? steerAroundWalls(state, p, { x: bub.x, y: bub.y }, p.speed)
        : { x: 0, y: 0 };
    }

    // Bot task progress (5s)
    if (!p.isHuman && p.doingTask && p.taskStationId !== null) {
      p.taskProgress += dt / 5000;
      if (p.taskProgress >= 1) {
        const s = state.taskStations.find(t => t.id === p.taskStationId);
        if (s && !s.completed) {
          s.completed = true;
          state.tasksCompleted++;
          p.phiTasks = (p.phiTasks ?? 0) + 1;
          if ((p.phiTasks ?? 0) >= 3 && !p.phiQualified) {
            p.phiQualified = true;
          }
        }
        p.doingTask = false;
        p.taskStationId = null;
        p.taskProgress = 0;
      }
    }

    // Move
    const sp = effSpeed(p, now);
    p.x += p.direction.x * sp;
    p.y += p.direction.y * sp;
    if (Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.1) {
      p.facingX = p.direction.x; p.facingY = p.direction.y;
    }
    p.x = Math.max(PLAYER_RADIUS, Math.min(state.mapWidth - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(state.mapHeight - PLAYER_RADIUS, p.y));
    const r = resolveCollisions(p.x, p.y, state.doors);
    p.x = r.x; p.y = r.y;

  }
}
