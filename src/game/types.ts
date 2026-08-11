export type Role = 'imposter' | 'crewmate' | 'protector';

export type Ability = 'jail' | 'crew' | 'kill' | 'shooter';

export type TeamIndex = 0 | 1 | 2;

export const TEAM_COLORS: Record<TeamIndex, string> = {
  0: '#4a90d9', // Blue
  1: '#e03030', // Red
  2: '#3dba6f', // Green
};

export const TEAM_NAMES: Record<TeamIndex, string> = {
  0: 'BLUE',
  1: 'RED',
  2: 'GREEN',
};

export type JailTimerOption = 'off' | 10 | 20 | 'infinity';
export type SpeedOption = 'slow' | 'medium' | 'fast';
export type FootballSpeedOption = 'slow' | 'medium-slow' | 'medium' | 'high' | 'extreme';
export type MapMode = 'mars' | 'football' | 'phi';
export type PhiFloorId = 'mars' | 'nucleus' | 'malteron' | 'neon';
export type BotPersonality = 'A' | 'B' | 'C' | 'D';
export type PhiGameMode = 'competition' | 'survivor';

export interface PhiCorpse {
  x: number; y: number;
  kind: 'player' | 'crew' | 'malteron';
  spawnedAt: number;
  ttl: number;
  facingX?: number;
}

export interface PhiBullet {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  ownerId: number;
  color: string;
  spawnedAt: number;
  expiresAt: number;
  hit?: boolean;
  targetX?: number; targetY?: number;
}

export interface PhiSpawnFx {
  x: number; y: number;
  startedAt: number;
  duration: number;
  color: string;
}

// ---- NEON OVERLOAD (Floor 4) ----
export type NeonColor = 'GREEN' | 'WHITE' | 'BLUE' | 'RED';
export interface NeonMazeCell { r: number; c: number; walls: { N: boolean; E: boolean; S: boolean; W: boolean } }
export interface NeonDragonSeg { x: number; y: number }
export interface NeonDragon {
  segments: NeonDragonSeg[];
  headCell: { r: number; c: number };
  dir: 'N' | 'E' | 'S' | 'W';
  cellProgress: number; // 0..1 to next cell
}
export interface NeonRing {
  id: number;
  x: number; y: number;
  color: NeonColor;
  radius: number;
  prevRadius?: number;
  maxRadius: number;
  growSpeed: number; // px/ms
  spawnedAt: number;
  ownerId?: number; // if player-emitted
  hitPlayers: Set<number>;
  consumedBy?: Set<number>; // players who neutralized this ring via matching immunity
  quadrant?: number; // 0..3 for placement bookkeeping
  isEvent: boolean; // true if authored event (danger); false = player-emitted immunity ring
}
export interface NeonPlayerState {
  immuneColor?: NeonColor;
  immuneUntil?: number;
}
export interface NeonState {
  maze: NeonMazeCell[][];
  cols: number; rows: number;
  cellSize: number;
  originX: number; originY: number;
  dragon: NeonDragon;
  rings: NeonRing[];
  nextRingId: number;
  mapping: Record<'2' | '3' | '4' | '5', NeonColor>;
  colorToKey: Record<NeonColor, '2' | '3' | '4' | '5'>;
  nextEventAt: number;
  pausedUntil: number;
  patternStep: number;
  perPlayer: Map<number, NeonPlayerState>;
}

export interface PhiElectron {
  orbit: 'outer' | 'middle' | 'inner';
  angle: number;      // radians
  angularSpeed: number; // rad/ms (signed)
  orbitRadius: number;
  size: number;
}

export interface PhiSnakeQueen {
  x: number; y: number;
  tx: number; ty: number;
  facingX: number;
  detectionRadius: number;
  nextTargetAt: number;
  bobT: number;
}

export interface PhiMalteron {
  id: number;
  x: number; y: number;
  facingX: number;
  alive: boolean;
  vx: number; vy: number;
  targetCrewId: number | null;
}

export interface PhiCrew {
  id: number;
  shooterId: number;
  x: number; y: number;
  facingX: number;
  alive: boolean;
}

export interface PhiState {
  floorSequence: PhiFloorId[];
  currentFloorIdx: number;
  floorPhase: 'active' | 'transition' | 'ended';
  floorStartedAt: number;
  floorDurationMs: number;    // 0 = no timer
  transitionUntil: number;
  nextFloorLabel?: string;
  banner?: { text: string; until: number };
  result?: 'draw' | 'winner';
  winnerName?: string;
  // Nucleus
  electrons?: PhiElectron[];
  nucleusRadius?: number;
  snakeQueen?: PhiSnakeQueen;
  // Malteron
  malterons?: PhiMalteron[];
  crew?: PhiCrew[];
  nextMalteronSpawnAt?: number;
  pendingMalteronSpawns?: number[];
  nextMalteronId?: number;
  nextCrewId?: number;
  arenaCX?: number; arenaCY?: number; arenaR?: number;
  // Malteron pre-round countdown
  malteronCountdownUntil?: number;
  malteronSpawned?: boolean;
  // Shared visuals
  corpses?: PhiCorpse[];
  spawnFx?: PhiSpawnFx[];
  bullets?: PhiBullet[];
  nextBulletId?: number;
  // Neon Overload floor
  neon?: NeonState;
  // Survivor mode
  survivorMode?: boolean;
  floorsSurvived?: number;
  survivorBest?: number;
}
export type MatchRounds = 3 | 5 | 10;
export type RoundTime = 60 | 120 | 300; // seconds per football round

export const ROUND_TIME_OPTIONS: RoundTime[] = [60, 120, 300];
export const ROUND_TIME_LABELS: Record<RoundTime, string> = {
  60: '1 min',
  120: '2 min',
  300: '5 min',
};


// Centralized football speed multipliers — tweak here to rebalance everything.
export const FOOTBALL_SPEED_MULT: Record<FootballSpeedOption, number> = {
  'slow': 0.5,
  'medium-slow': 0.85,
  'medium': 1.0,
  'high': 1.5,
  'extreme': 2.0,
};

export const FOOTBALL_SPEED_LABELS: Record<FootballSpeedOption, string> = {
  'slow': 'Slow',
  'medium-slow': 'Medium Slow',
  'medium': 'Medium',
  'high': 'High',
  'extreme': 'Extreme',
};

export const FOOTBALL_SPEED_OPTIONS: FootballSpeedOption[] = [
  'slow', 'medium-slow', 'medium', 'high', 'extreme',
];

export interface GameSettings {
  tasks: number;          // 0-15
  jailTimer: JailTimerOption;
  playerCount: number;    // 2-12
  speed: SpeedOption;
  roleAbilities: [Ability, Ability, Ability]; // role1, role2, role3
  roleCounts: [number, number, number];       // sum === playerCount
  mapMode?: MapMode;       // 'mars' (default) | 'football'
  matchRounds?: MatchRounds; // football only
  footballSpeed?: FootballSpeedOption; // football only; defaults to 'medium'
  roundTime?: RoundTime; // football only; seconds per round (default 120)
  phiGameMode?: PhiGameMode; // 'competition' (default) | 'survivor'
}

export const DEFAULT_SETTINGS: GameSettings = {
  tasks: 10,
  jailTimer: 'off',
  playerCount: 10,
  speed: 'medium',
  roleAbilities: ['crew', 'crew', 'crew'],
  roleCounts: [10, 0, 0],
  mapMode: 'phi',
  matchRounds: 5,
  footballSpeed: 'medium',
  roundTime: 120,

};


export type TaskType =
  | 'frequency'
  | 'morse'
  | 'satellite'
  | 'backup'
  | 'solar'
  | 'power'
  | 'magnetic'
  | 'password'
  | 'ice'
  | 'dna'
  | 'door';

export interface TaskStation {
  id: number;
  x: number;
  y: number;
  label: string;
  taskType: TaskType;
  completed: boolean;
  team: TeamIndex;
}

export interface TaskChallenge {
  type: TaskType;
  stationId: number;
  prompt: string;
  answer: string;
  // frequency
  targetAngle?: number;
  // morse
  morsePattern?: ('short' | 'long')[];
  // satellite
  targetRotation?: number;
  // backup - auto progress
  duration?: number;
  // password
  passwordDigits?: string;
  // dna
  dnaOffset?: number;
  // ice
  tapsRequired?: number;
  // door
  doorId?: number;
  doorAction?: 'open' | 'close';
}

export interface Player {
  id: number;
  x: number;
  y: number;
  role: Role;
  ability: Ability;
  team: TeamIndex;
  alive: boolean;
  frozen: boolean;
  frozenUntil: number;
  name: string;
  isHuman: boolean;
  speed: number;
  direction: { x: number; y: number };
  aiTargetX: number;
  aiTargetY: number;
  aiChangeTime: number;
  killCooldown: number;
  freezeCooldown: number;
  doingTask: boolean;
  taskStationId: number | null;
  taskProgress: number; // 0-1
  jailed: boolean;
  jailedUntil: number;
  arrestCooldown: number;
  // Bot decision-making
  actionPlanAt: number;
  actionPlanTargetId: number | null;
  actionSkipUntil: number;
  doorBusyUntil: number;
  doorBusyId: number | null;
  // Enhanced (smart) bot flag and lock-on target
  enhanced?: boolean;
  lockedTargetId?: number | null;
  // Power-up state
  shields?: number;
  speedBoostUntil?: number;
  builderCharges?: number;
  facingX?: number;
  facingY?: number;
  // Builder-block platform state
  elevatedPlatformId?: number | null;
  posHistory?: Array<{ x: number; y: number; t: number }>;
  // Football mode
  footballTeam?: 'red' | 'blue';
  powerShotCharges?: number;
  // Hunter "search rooms" state — visit each room when no enemy spotted
  lastEnemySeenAt?: number;
  searchRouteIdx?: number;
  // Football "escape mode" — bots break out of corner pile-ups
  stuckSampleAt?: number;
  stuckSampleX?: number;
  stuckSampleY?: number;
  escapeUntil?: number;
  escapeTX?: number;
  escapeTY?: number;

  // PHI Castle per-player state
  phiTasks?: number;           // tasks done this Mars floor
  phiQualified?: boolean;      // finished current floor -> spectator
  phiEliminated?: boolean;     // dead in current match (permanent)
  phiSpectator?: boolean;      // dead but chose to spectate
  phiFrozen?: boolean;         // inside Snake Queen radius
  phiFrozenPos?: { x: number; y: number };
  phiBullets?: number;         // Malteron bullets remaining
  phiReloadUntil?: number;     // Malteron reload timestamp
  phiCrewId?: number;          // Malteron: assigned crew NPC id
  botPersonality?: BotPersonality;
  phiSpawnAt?: number;         // Malteron/enemy safe-spawn timestamp
  neonImmuneColor?: 'GREEN' | 'WHITE' | 'BLUE' | 'RED';
  neonImmuneUntil?: number;
  /** Brief grace after a successful frequency save; wrong rings ignored. */
  phiProtectedUntil?: number;
  /** Neon Overload: system heat 0..1 from spamming frequency keys. */
  phiHeat?: number;
  /** Timestamp of last frequency emit (heat build-up). */
  phiLastEmitAt?: number;
}


export interface Platform {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  // Unit vector pointing OUT of the front face (away from the placer's back).
  // Equal to the placer's facing direction at placement time.
  frontX: number;
  frontY: number;
  placedAt: number;
  expiresAt: number;
  placerId: number;
}




export interface FreezeProjectile {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  startTime: number;
  duration: number; // ms
  // New (bullet) fields. When `kind === 'bullet'` the projectile travels in
  // a straight line from (x,y) along (dirX,dirY) at `speed` (px/ms) up to
  // `maxDistance` and can be dodged by moving out of its path.
  kind?: 'freeze' | 'bullet';
  ownerId?: number;
  ownerTeam?: TeamIndex;
  dirX?: number;
  dirY?: number;
  maxDistance?: number;
  hit?: boolean;
}

export interface Door {
  id: number;
  // Wall-segment endpoints (when closed, blocks movement & vision)
  x1: number; y1: number;
  x2: number; y2: number;
  // Center point used for proximity checks
  cx: number; cy: number;
  open: boolean;
  lastUsedAt: number;
  label: string;
  // Synthetic = player-placed wall block (never interactable, time-limited).
  synthetic?: boolean;
  expiresAt?: number;
}

export type PowerupKind = 'speed' | 'life' | 'builder';

export interface Powerup {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  spawnedAt: number;
}

export interface GameState {
  players: Player[];
  phase: 'lobby' | 'playing' | 'gameover';
  winner: TeamIndex | null;
  timeElapsed: number;
  mapWidth: number;
  mapHeight: number;
  taskStations: TaskStation[];
  tasksCompleted: number;
  totalTasks: number;
  activeTask: TaskChallenge | null;
  projectiles: FreezeProjectile[];
  recentArrest: { name: string; time: number; eventId: number } | null;
  doors: Door[];
  jailDuration: number;        // 0 = arrest disabled, Infinity = permanent
  settings: GameSettings;
  teamAbilities: [Ability, Ability, Ability];
  teamCounts: [number, number, number];
  powerups: Powerup[];
  nextPowerupSpawnAt: number;
  nextPowerupId: number;
  nextSyntheticDoorId: number;
  platforms: Platform[];
  nextPlatformId: number;
  // Football mode
  mode?: MapMode;
  ball?: Ball;
  score?: { red: number; blue: number };
  roundsRemaining?: number;
  totalRounds?: number;
  lastGoalAt?: number; // freeze movement briefly after a goal
  goalFlash?: { team: 'red' | 'blue' | 'tie'; time: number } | null;
  roundStartedAt?: number; // performance.now() when current football round began
  // Referee intervention (football)
  ballCornerSince?: number;      // ms timestamp when ball first entered a corner
  refereeActive?: boolean;
  refereeStartedAt?: number;
  refereeMessage?: string | null;
  refereeCooldownUntil?: number;
  // PHI Castle mode
  phi?: PhiState;
}

export interface Ball {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  lastTouchTeam?: 'red' | 'blue' | null;
}

export const FOOTBALL_FIELD = {
  // Same width as Mars; field is the full map.
  margin: 80,
  goalWidth: 220,
  goalDepth: 36,
};

export const BALL_RADIUS = 18;
export const BALL_FRICTION = 0.985;
export const BALL_MAX_SPEED = 14;
export const BALL_HIT_FORCE = 1.6;
export const BALL_POWER_SHOT_MULT = 2.4;


export const PLAYER_RADIUS = 18;
export const KILL_RANGE = 42;
// Tight range required for the melee `kill` ability — must be hugging close.
export const KILL_CLOSE_RANGE = 34;
// Shooter can fire anywhere inside their vision; bullet then has to connect.
export const SHOOTER_RANGE = 260;
// Bullet travel speed in px / ms.
export const BULLET_SPEED = 0.95;
// Bullet hit radius around player center.
export const BULLET_HIT_RADIUS = 16;
export const FREEZE_RANGE = 120;
export const FREEZE_DURATION = 5000;
export const KILL_COOLDOWN = 5000;
export const FREEZE_COOLDOWN = 10000;
export const MAP_WIDTH = 2000;
export const MAP_HEIGHT = 1200;
export const TASK_RANGE = 60;
export const TOTAL_TASKS = 10;

// Jail / Arrest
export const ARREST_RANGE = 55;
export const ARREST_COOLDOWN = 10000;
export const JAIL_DURATION = 20000;
export const MAX_JAILED = 2;
export const JAIL_RECT = { x: 1290, y: 950, w: 270, h: 220 };
export const JAIL_RELEASE = { x: 800, y: 700 };

// Doors
export const DOOR_USE_COOLDOWN = 1500;
export const DOOR_INTERACT_RANGE = 55;

// Power-ups
export const POWERUP_RADIUS = 16;
export const POWERUP_PICKUP_RANGE = 28;
export const POWERUP_SPAWN_INTERVAL_MIN = 12000;
export const POWERUP_SPAWN_INTERVAL_MAX = 22000;
export const POWERUP_MAX_ON_MAP = 4;
export const SPEED_BOOST_DURATION = 5000;
export const SPEED_BOOST_MULT = 1.6;
export const BUILDER_BLOCK_LIFETIME = 60000;
export const BUILDER_BLOCK_LENGTH = 90;
export const BUILDER_BLOCK_SIZE = 64;            // platform footprint (square)
export const BUILDER_PREV_POS_DELAY_MS = 550;    // how far back to snapshot prev pos
export const PLATFORM_ELEVATION_OFFSET = 18;     // visual lift for elevated players

