import {
  GameSettings, GameState, DEFAULT_SETTINGS, Player, PhiFloorId, PhiState,
  MAP_WIDTH, MAP_HEIGHT, PLAYER_RADIUS,
} from '../types';
import { createGame } from '../engine';
import { initNucleusFloor, tickNucleus, renderNucleus } from './nucleusFloor';
import { initMalteronFloor, tickMalteron, renderMalteron } from './malteronFloor';
import { tickMars, initMarsFloor } from './marsFloor';
import { initNeonFloor, tickNeon, renderNeon } from './neonFloor';
import { renderGame as renderMarsBase } from '../renderer';
import { assignPersonalities, ensurePhiBuffers, tickCorpsesAndFx } from './shared';

const MATCH_LENGTH = 5;
const TRANSITION_MS = 3000;

const FLOOR_NAMES: Record<PhiFloorId, string> = {
  mars: 'FLOOR 1 — MARS COLONY',
  nucleus: 'FLOOR 2 — THE NUCLEUS RUN',
  malteron: 'FLOOR 3 — MALTERON',
  neon: 'FLOOR 4 — NEON OVERLOAD',
};

const FLOOR_DURATION: Record<PhiFloorId, number> = {
  mars: 0,
  nucleus: 220_000,
  malteron: 240_000,
  neon: 250_000,
};

export function currentFloor(state: GameState): PhiFloorId {
  const phi = state.phi!;
  return phi.floorSequence[phi.currentFloorIdx];
}

function makeSequence(len = MATCH_LENGTH): PhiFloorId[] {
  // Random floor order with repeats allowed. All 4 floors must appear at least once.
  const pool: PhiFloorId[] = ['mars', 'nucleus', 'malteron', 'neon'];
  const seq: PhiFloorId[] = [...pool].sort(() => Math.random() - 0.5);
  while (seq.length < len) {
    seq.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return seq.slice(0, len);
}

export function createPhiMatch(settings: GameSettings, playerName?: string): GameState {
  const isSurvivor = settings.phiGameMode === 'survivor';
  // Survivor: single player, no local-player bots.
  const pc = isSurvivor ? 1 : Math.max(2, Math.min(15, settings.playerCount));
  const patched: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    playerCount: pc,
    tasks: 3,
    jailTimer: 'off',
    mapMode: 'phi',
    roleAbilities: ['crew', 'crew', 'crew'],
    roleCounts: [pc, 0, 0],
  };
  const base = createGame(patched, playerName);
  base.mode = 'phi';
  // Survivor: much longer floor loop so play continues until death.
  const sequence = isSurvivor ? makeSequence(24) : makeSequence();
  let best = 0;
  try {
    const raw = localStorage.getItem('asteron.survivor.best');
    if (raw) best = Number(raw) || 0;
  } catch { /* sandbox */ }
  const phi: PhiState = {
    floorSequence: sequence,
    currentFloorIdx: 0,
    floorPhase: 'active',
    floorStartedAt: performance.now(),
    floorDurationMs: FLOOR_DURATION[sequence[0]],
    transitionUntil: 0,
    banner: { text: FLOOR_NAMES[sequence[0]], until: performance.now() + 2500 },
    survivorMode: isSurvivor,
    floorsSurvived: 0,
    survivorBest: best,
  };
  base.phi = phi;
  for (const p of base.players) {
    p.phiTasks = 0;
    p.phiQualified = false;
    p.phiEliminated = false;
    p.phiSpectator = false;
    p.phiFrozen = false;
    if (!p.isHuman) p.enhanced = true;
  }
  assignPersonalities(base);
  ensurePhiBuffers(base);
  initFloor(base);
  return base;
}

/** Called when entering a floor (fresh or after transition). */
function initFloor(state: GameState) {
  const phi = state.phi!;
  const floor = currentFloor(state);
  phi.floorDurationMs = FLOOR_DURATION[floor];
  // Survivor Mars: strict 20-second window to complete 3 out of 5 tasks.
  if (phi.survivorMode && floor === 'mars') phi.floorDurationMs = 20_000;
  phi.floorStartedAt = performance.now();
  phi.floorPhase = 'active';
  phi.banner = { text: FLOOR_NAMES[floor], until: performance.now() + 2500 };
  // Reset per-player floor state (keep eliminated).
  for (const p of state.players) {
    if (p.phiEliminated) continue;
    p.phiQualified = false;
    p.phiFrozen = false;
    p.phiTasks = 0;
    p.alive = true;
    p.direction = { x: 0, y: 0 };
    p.doingTask = false;
    p.taskStationId = null;
    p.phiBullets = 3;
    p.phiReloadUntil = 0;
    p.phiCrewId = undefined;
    p.phiProtectedUntil = 0;
  }
  // Wipe floor-specific state
  phi.electrons = undefined;
  phi.mRuntime = undefined;
  phi.snakeQueen = undefined;
  phi.malterons = undefined;
  phi.crew = undefined;
  phi.arenaCX = undefined;
  phi.arenaCY = undefined;
  phi.arenaR = undefined;
  phi.neon = undefined;
  phi.corpses = [];
  phi.spawnFx = [];
  phi.bullets = [];
  phi.malteronCountdownUntil = undefined;
  phi.malteronSpawned = false;

  if (floor === 'mars') initMarsFloor(state);
  else if (floor === 'nucleus') initNucleusFloor(state);
  else if (floor === 'malteron') initMalteronFloor(state);
  else initNeonFloor(state);
}

function activeContestants(state: GameState): Player[] {
  return state.players.filter(p => !p.phiEliminated && !p.phiQualified);
}

function endMatchIfDone(state: GameState): boolean {
  const phi = state.phi!;
  if (phi.survivorMode) {
    const human = state.players[0];
    if (human.phiEliminated) {
      const score = phi.floorsSurvived ?? 0;
      const prev = phi.survivorBest ?? 0;
      if (score > prev) {
        phi.survivorBest = score;
        try { localStorage.setItem('asteron.survivor.best', String(score)); } catch { /* sandbox */ }
      }
      phi.result = 'draw';
      phi.floorPhase = 'ended';
      state.phase = 'gameover';
      return true;
    }
    return false;
  }
  const surv = state.players.filter(p => !p.phiEliminated);
  if (surv.length === 0) {
    phi.result = 'draw';
    phi.floorPhase = 'ended';
    state.phase = 'gameover';
    return true;
  }
  if (surv.length === 1) {
    phi.result = 'winner';
    phi.winnerName = surv[0].name;
    phi.floorPhase = 'ended';
    state.phase = 'gameover';
    return true;
  }
  return false;
}

function advanceFloor(state: GameState) {
  const phi = state.phi!;
  phi.floorsSurvived = (phi.floorsSurvived ?? 0) + 1;
  if (phi.currentFloorIdx >= phi.floorSequence.length - 1) {
    if (phi.survivorMode) {
      // Extend sequence indefinitely
      phi.floorSequence.push(...makeSequence(8));
    } else {
      const surv = state.players.filter(p => !p.phiEliminated);
      if (surv.length === 1) { phi.result = 'winner'; phi.winnerName = surv[0].name; }
      else if (surv.length === 0) phi.result = 'draw';
      else {
        const human = surv.find(p => p.isHuman);
        phi.result = 'winner';
        phi.winnerName = (human ?? surv[0]).name;
      }
      phi.floorPhase = 'ended';
      state.phase = 'gameover';
      return;
    }
  }
  phi.currentFloorIdx++;
  initFloor(state);
}

function beginTransition(state: GameState, msg?: string) {
  const phi = state.phi!;
  if (phi.floorPhase !== 'active') return;
  phi.floorPhase = 'transition';
  const now = performance.now();
  phi.transitionUntil = now + TRANSITION_MS;
  if (msg) phi.banner = { text: msg, until: now + TRANSITION_MS };
}

export function updatePhi(
  state: GameState,
  dt: number,
  keys: Set<string>,
  now: number,
  isMobile: boolean,
): GameState {
  const phi = state.phi;
  if (!phi || state.phase !== 'playing') return state;

  if (phi.floorPhase === 'transition') {
    if (now >= phi.transitionUntil) advanceFloor(state);
    return { ...state, timeElapsed: state.timeElapsed + dt };
  }

  const floor = currentFloor(state);
  if (floor === 'mars') tickMars(state, dt, keys, now, isMobile);
  else if (floor === 'nucleus') tickNucleus(state, dt, keys, now, isMobile);
  else if (floor === 'malteron') tickMalteron(state, dt, keys, now, isMobile);
  else tickNeon(state, dt, keys, now, isMobile);

  tickCorpsesAndFx(state, now);

  // Post-tick: check qualifiers / timer / winner
  if (phi.floorPhase === 'active') {
    const survivors = state.players.filter(p => !p.phiEliminated);
    const stillPlaying = survivors.filter(p => !p.phiQualified);

    // Mars: only eliminate remaining players if the total remaining task
    // pool has dropped below 3 (nobody else can possibly qualify).
    // Do NOT touch already-qualified players.
    if (floor === 'mars') {
      const remaining = state.taskStations.filter(s => !s.completed).length;
      if (remaining < 3) {
        for (const p of stillPlaying) {
          p.phiEliminated = true;
          p.alive = false;
        }
      }
    }

    // Timer expiry
    if (phi.floorDurationMs > 0 && now - phi.floorStartedAt >= phi.floorDurationMs) {
      // Non-qualifiers die on timeout
      for (const p of stillPlaying) {
        if (!p.phiEliminated) {
          if (floor === 'nucleus' || floor === 'neon') { p.phiEliminated = true; p.alive = false; }
          else if (floor === 'malteron') {
            const crew = phi.crew?.find(c => c.id === p.phiCrewId);
            if (crew && crew.alive) p.phiQualified = true;
            else { p.phiEliminated = true; p.alive = false; }
          }
        }
      }
      // Neon: everyone still alive at timeout qualifies (survival win)
      if (floor === 'neon') {
        for (const p of state.players) if (!p.phiEliminated) p.phiQualified = true;
      }
      if (!endMatchIfDone(state)) {
        beginTransition(state, 'TIME UP — PROCEEDING...');
      }
      return { ...state, timeElapsed: state.timeElapsed + dt };
    }

    // All active players qualified early?
    const remainingActive = state.players.filter(p => !p.phiEliminated && !p.phiQualified);
    if (remainingActive.length === 0 && survivors.length > 0) {
      if (!endMatchIfDone(state)) {
        beginTransition(state, 'ALL PLAYERS QUALIFIED. PROCEEDING...');
      }
      return { ...state, timeElapsed: state.timeElapsed + dt };
    }

    // Everyone dead / lone survivor
    endMatchIfDone(state);
  }

  return { ...state, timeElapsed: state.timeElapsed + dt };
}

export function renderPhi(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number, h: number,
) {
  const floor = currentFloor(state);
  if (floor === 'mars') {
    const oldMode = state.mode;
    state.mode = 'mars';
    renderMarsBase(ctx, state, w, h);
    state.mode = oldMode;
  } else if (floor === 'nucleus') {
    renderNucleus(ctx, state, w, h);
  } else if (floor === 'malteron') {
    renderMalteron(ctx, state, w, h);
  } else {
    renderNeon(ctx, state, w, h);
  }
}
