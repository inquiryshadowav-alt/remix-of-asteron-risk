import { TaskChallenge, TaskStation, TaskType, TOTAL_TASKS, MAP_WIDTH, MAP_HEIGHT, TeamIndex, JAIL_RECT } from './types';
import { OBSTACLES, createDoors, resolveCollisions } from './collision';

const TASK_LABELS: Record<TaskType, string> = {
  frequency: '📻 Frequency',
  morse: '📟 Morse Code',
  satellite: '📡 Satellite',
  backup: '📁 Backup',
  solar: '🧼 Solar Panel',
  power: '🔋 Power',
  magnetic: '🧩 Magnetic',
  password: '🔑 Password',
  ice: '🧊 Ice Shatter',
  dna: '🧬 DNA Slider',
  door: '🚪 Door',
};

const STATION_CLEARANCE = 34;   // free space required around a station
const STATION_SPACING = 190;    // min distance between two stations

/** True when a point is on open, walkable ground (no wall/rock/jail overlap). */
function isWalkable(x: number, y: number, doors: ReturnType<typeof createDoors>): boolean {
  if (x < 90 || y < 90 || x > MAP_WIDTH - 90 || y > MAP_HEIGHT - 90) return false;
  // keep out of the jail
  if (
    x > JAIL_RECT.x - STATION_CLEARANCE && x < JAIL_RECT.x + JAIL_RECT.w + STATION_CLEARANCE &&
    y > JAIL_RECT.y - STATION_CLEARANCE && y < JAIL_RECT.y + JAIL_RECT.h + STATION_CLEARANCE
  ) return false;
  // keep away from rocks/obstacles
  for (const o of OBSTACLES) {
    const dx = x - o.x, dy = y - o.y;
    if (Math.hypot(dx, dy) < o.r + STATION_CLEARANCE) return false;
  }
  // the point and a ring around it must survive wall collision resolution
  const probes: [number, number][] = [
    [0, 0],
    [STATION_CLEARANCE, 0], [-STATION_CLEARANCE, 0],
    [0, STATION_CLEARANCE], [0, -STATION_CLEARANCE],
  ];
  for (const [ox, oy] of probes) {
    const r = resolveCollisions(x + ox, y + oy, doors);
    if (Math.hypot(r.x - (x + ox), r.y - (y + oy)) > 0.5) return false;
  }
  return true;
}

/** Randomized set of walkable Mars task positions, well spread across the map. */
function randomWalkablePositions(n: number): { x: number; y: number }[] {
  const doors = createDoors();
  const out: { x: number; y: number }[] = [];
  let spacing = STATION_SPACING;
  let guard = 0;
  while (out.length < n && guard < 20000) {
    guard++;
    const x = 90 + Math.random() * (MAP_WIDTH - 180);
    const y = 90 + Math.random() * (MAP_HEIGHT - 180);
    if (!isWalkable(x, y, doors)) continue;
    if (out.some(p => Math.hypot(p.x - x, p.y - y) < spacing)) continue;
    out.push({ x: Math.round(x), y: Math.round(y) });
    if (guard % 4000 === 0) spacing = Math.max(70, spacing * 0.7); // relax if crowded
  }
  return out;
}

export function createTaskStations(count: number = TOTAL_TASKS, team: TeamIndex = 0, idOffset: number = 0): TaskStation[] {
  const positions = randomWalkablePositions(Math.max(1, Math.min(30, count)));


  const types: TaskType[] = [
    'frequency', 'morse', 'satellite', 'backup', 'solar',
    'power', 'magnetic', 'password', 'ice', 'dna',
  ];

  const n = Math.max(0, Math.min(30, count));
  const stations: TaskStation[] = [];
  for (let i = 0; i < n; i++) {
    const pos = positions[i % positions.length];
    const type = types[i % types.length];
    stations.push({
      id: idOffset + i,
      x: pos.x + (team === 1 ? 35 : team === 2 ? -35 : 0),
      y: pos.y,
      label: TASK_LABELS[type],
      taskType: type,
      completed: false,
      team,
    });
  }
  return stations;
}

export function generateTaskChallenge(station: TaskStation): TaskChallenge {
  switch (station.taskType) {
    case 'frequency': {
      const targetAngle = Math.floor(Math.random() * 300) + 30;
      return { type: 'frequency', stationId: station.id, prompt: 'Tune the frequency', answer: '', targetAngle };
    }
    case 'morse': {
      const patterns: ('short' | 'long')[][] = [
        ['short', 'short', 'long'],
        ['long', 'short', 'short'],
        ['short', 'long', 'short'],
        ['long', 'long', 'short'],
        ['short', 'long', 'long'],
      ];
      const morsePattern = patterns[Math.floor(Math.random() * patterns.length)];
      return { type: 'morse', stationId: station.id, prompt: 'Repeat the pattern', answer: '', morsePattern };
    }
    case 'satellite': {
      const targetRotation = Math.floor(Math.random() * 300) + 30;
      return { type: 'satellite', stationId: station.id, prompt: 'Align the dish', answer: '', targetRotation };
    }
    case 'backup': {
      return { type: 'backup', stationId: station.id, prompt: 'Backing up data...', answer: '', duration: 5000 };
    }
    case 'solar': {
      return { type: 'solar', stationId: station.id, prompt: 'Swipe to clean!', answer: '' };
    }
    case 'power': {
      return { type: 'power', stationId: station.id, prompt: 'Flick batteries up!', answer: '' };
    }
    case 'magnetic': {
      return { type: 'magnetic', stationId: station.id, prompt: 'Snap the pieces!', answer: '' };
    }
    case 'password': {
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      return { type: 'password', stationId: station.id, prompt: 'Remember the code', answer: digits, passwordDigits: digits };
    }
    case 'ice': {
      const tapsRequired = 15 + Math.floor(Math.random() * 10);
      return { type: 'ice', stationId: station.id, prompt: 'Tap to shatter!', answer: '', tapsRequired };
    }
    case 'dna': {
      const dnaOffset = Math.floor(Math.random() * 5) + 2;
      return { type: 'dna', stationId: station.id, prompt: 'Align the strands', answer: '', dnaOffset };
    }
  }
}
