import { GameState, Player, PLAYER_RADIUS, TASK_RANGE, TaskStation, MAP_WIDTH, MAP_HEIGHT } from '../types';
import { createTaskStations } from '../tasks';
import { resolveCollisions, createDoors } from '../collision';
import { getNavigationDirection } from '../navigation';

/** Mars floor: complete 3 tasks. No combat, no jail. Player count × 2 task stations. */
export function initMarsFloor(state: GameState) {
  state.mapWidth = MAP_WIDTH;
  state.mapHeight = MAP_HEIGHT;
  state.doors = createDoors();
  state.powerups = [];
  state.projectiles = [];
  state.platforms = [];
  const pc = state.players.length;
  const total = pc * 2;
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

  // Human keyboard input — qualified players may keep playing (do more tasks).
  if (human.alive && !human.phiEliminated && !human.doingTask) {
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
    // Qualified bots stop competing (leave remaining tasks for others).
    if (!p.isHuman && !p.doingTask && !p.phiQualified) {
      const target = nearestIncompleteTask(p, state);
      if (target) {
        const d = Math.hypot(target.x - p.x, target.y - p.y);
        if (d < TASK_RANGE * 0.6) {
          p.doingTask = true;
          p.taskStationId = target.id;
          p.taskProgress = 0;
          p.direction = { x: 0, y: 0 };
        } else {
          p.direction = getNavigationDirection(p.x, p.y, target.x, target.y);
        }
      } else {
        p.direction = { x: 0, y: 0 };
      }
    } else if (!p.isHuman && p.phiQualified) {
      p.direction = { x: 0, y: 0 };
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
    p.x += p.direction.x * p.speed;
    p.y += p.direction.y * p.speed;
    if (Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.1) {
      p.facingX = p.direction.x; p.facingY = p.direction.y;
    }
    p.x = Math.max(PLAYER_RADIUS, Math.min(state.mapWidth - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(state.mapHeight - PLAYER_RADIUS, p.y));
    const r = resolveCollisions(p.x, p.y, state.doors);
    p.x = r.x; p.y = r.y;
  }
}
