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
import { resetBubbles } from './bubbles';

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
  nucleus: 120_000,
  malteron: 120_000,
  neon: 120_000,
};

export function currentFloor(state: GameState): PhiFloorId {
  const phi = state.phi!;
  return phi.floorSequence[phi.currentFloorIdx];
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a floor sequence: every distinct floor is played once (in random
 * order) before any floor repeats. Longer matches keep cycling reshuffled
 * batches so the order stays varied.
 */
function makeSequence(len = MATCH_LENGTH): PhiFloorId[] {
  const pool: PhiFloorId[] = ['mars', 'nucleus', 'malteron', 'neon'];
  const seq: PhiFloorId[] = [];
  while (seq.length < len) seq.push(...shuffled(pool));
  return seq.slice(0, Math.max(1, len));
}

/** Standings row used by the in-game ranking board and the results screen. */
export interface PhiRankRow {
  id: number;
  name: string;
  isHuman: boolean;
  xp: number;
  floorXp: number;
  qualified: number;
  died: number;
  hearts: number;
  rank: number;
}

/**
 * Ranking is XP-driven: +1 XP per nucleus touched, Malteron killed, Mars task
 * completed and correct Neon frequency released. Ties break on the XP earned
 * on the current floor, then on who resolved the previous floor earliest.
 */
export function computeRankings(state: GameState): PhiRankRow[] {
  const rows = state.players.map(p => ({
    id: p.id,
    name: p.name,
    isHuman: !!p.isHuman,
    xp: p.phiXP ?? 0,
    floorXp: p.phiFloorXP ?? 0,
    qualified: p.phiFloorsQualified ?? 0,
    died: p.phiFloorsDied ?? 0,
    hearts: p.phiExtraHealth ?? 0,
    order: p.phiLastQualifyOrder ?? Number.MAX_SAFE_INTEGER,
    rank: 0,
  }));
  rows.sort((a, b) =>
    b.xp - a.xp ||
    b.floorXp - a.floorXp ||
    a.order - b.order ||
    a.id - b.id,
  );
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows.map(({ order, ...rest }) => rest);
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
  const floorCount = Math.max(1, Math.min(100, Math.round(settings.phiFloorCount ?? MATCH_LENGTH)));
  const sequence = isSurvivor ? makeSequence(24) : makeSequence(floorCount);
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
    qualifyCounter: 0,
  };
  base.phi = phi;
  for (const p of base.players) {
    p.phiTasks = 0;
    p.phiQualified = false;
    p.phiEliminated = false;
    p.phiSpectator = false;
    p.phiFrozen = false;
    p.phiFloorsQualified = 0;
    p.phiFloorsDied = 0;
    p.phiQualifyOrder = undefined;
    p.phiLastQualifyOrder = undefined;
    p.phiExtraHealth = 0;
    p.phiXP = 0;
    p.phiFloorXP = 0;
    p.phiBaseSpeed = p.speed;
    p.enhanced = false;

  }
  // Exactly half of the bots (rounded) are Enhanced bots.
  const bots = base.players.filter(p => !p.isHuman);
  const enhancedCount = Math.round(bots.length / 2);
  for (const b of shuffled(bots).slice(0, enhancedCount)) b.enhanced = true;
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
  // Survivor Mars: 60-second window to complete 3 out of 5 tasks.
  if (phi.survivorMode && floor === 'mars') phi.floorDurationMs = 60_000;
  phi.floorStartedAt = performance.now();
  phi.floorPhase = 'active';
  phi.banner = { text: FLOOR_NAMES[floor], until: performance.now() + 2500 };
  phi.qualifyCounter = 0;
  phi.spectateId = undefined;
  // Reset per-player floor state. In competition everyone revives each floor:
  // death only lasts for the floor it happened on.
  for (const p of state.players) {
    if (phi.survivorMode && p.phiEliminated) continue;
    p.phiEliminated = false;
    p.phiSpectator = false;
    p.phiQualified = false;
    p.phiFrozen = false;
    p.phiTasks = 0;
    p.phiFloorXP = 0;
    p.phiQualifyOrder = undefined;
    p.phiHeat = 0;

    p.alive = true;
    p.direction = { x: 0, y: 0 };
    p.doingTask = false;
    p.taskStationId = null;
    p.phiBullets = 3;
    p.phiReloadUntil = 0;
    p.phiCrewId = undefined;
    p.phiProtectedUntil = 0;
    p.phiFrozenUntil = 0;
    p.phiSpeedUntil = 0;
    p.phiGunHeat = 0;
    p.phiGunLocked = false;
    p.phiAtomStage = 0;
    if (p.phiBaseSpeed === undefined) p.phiBaseSpeed = p.speed;
    else p.speed = p.phiBaseSpeed;
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
  phi.pendingMalteronSpawns = [];
  phi.atomStage = 0;
  phi.atomNameUntil = 0;
  resetBubbles(state, performance.now());

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
  // Competition: nobody is out for good — the match only ends when the
  // selected number of floors has been played.
  return false;
}

/** Close out the current floor: bank qualified/died counters per player. */
function tallyFloor(state: GameState) {
  const phi = state.phi!;
  if (phi.survivorMode) return;
  for (const p of state.players) {
    if (p.phiQualified) {
      p.phiFloorsQualified = (p.phiFloorsQualified ?? 0) + 1;
      p.phiLastQualifyOrder = p.phiQualifyOrder ?? Number.MAX_SAFE_INTEGER;
    } else {
      p.phiLastQualifyOrder = Number.MAX_SAFE_INTEGER;
    }
    if (p.phiEliminated) p.phiFloorsDied = (p.phiFloorsDied ?? 0) + 1;
  }
}

function finishMatch(state: GameState) {
  const phi = state.phi!;
  const rows = computeRankings(state);
  phi.finalOrder = rows.map(r => r.id);
  phi.result = 'winner';
  phi.winnerName = rows[0]?.name ?? '';
  phi.floorPhase = 'ended';
  state.phase = 'gameover';
}

function advanceFloor(state: GameState) {
  const phi = state.phi!;
  phi.floorsSurvived = (phi.floorsSurvived ?? 0) + 1;
  if (phi.currentFloorIdx >= phi.floorSequence.length - 1) {
    if (phi.survivorMode) {
      // Extend sequence indefinitely
      phi.floorSequence.push(...makeSequence(8));
    } else {
      finishMatch(state);
      return;
    }
  }
  phi.currentFloorIdx++;
  initFloor(state);
}

function beginTransition(state: GameState, msg?: string) {
  const phi = state.phi!;
  if (phi.floorPhase !== 'active') return;
  tallyFloor(state);
  phi.floorPhase = 'transition';
  const now = performance.now();
  phi.transitionUntil = now + TRANSITION_MS;
  phi.banner = msg ? { text: msg, until: now + 1200 } : undefined;
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

  // Record qualification order (used to break ranking ties).
  for (const p of state.players) {
    if (p.phiQualified && p.phiQualifyOrder === undefined) {
      phi.qualifyCounter = (phi.qualifyCounter ?? 0) + 1;
      p.phiQualifyOrder = phi.qualifyCounter;
    }
  }

  // Dead human auto-spectates the nearest still-playing player.
  if (!phi.survivorMode) {
    const h = state.players[0];
    if (h.phiEliminated) {
      const cur = phi.spectateId !== undefined
        ? state.players.find(p => p.id === phi.spectateId)
        : undefined;
      if (!cur || cur.phiEliminated) {
        const candidates = state.players.filter(p => !p.isHuman && !p.phiEliminated);
        let best: Player | undefined;
        let bestD = Infinity;
        for (const p of candidates) {
          const d = Math.hypot(p.x - h.x, p.y - h.y);
          if (d < bestD) { bestD = d; best = p; }
        }
        phi.spectateId = best?.id;
      }
    } else if (phi.spectateId !== undefined) {
      phi.spectateId = undefined;
    }
  }

  // Post-tick: check qualifiers / timer / winner
  if (phi.floorPhase === 'active') {
    const survivors = state.players.filter(p => !p.phiEliminated);
    const stillPlaying = survivors.filter(p => !p.phiQualified);


    // Mars (competition): nobody is eliminated for running out of tasks.
    // Everyone keeps playing until every station on the colony is done.
    if (floor === 'mars' && !phi.survivorMode) {
      const remaining = state.taskStations.filter(s => !s.completed).length;
      if (remaining === 0) {
        beginTransition(state, 'ALL TASKS COMPLETE');
        return { ...state, timeElapsed: state.timeElapsed + dt };
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
          else if (floor === 'mars' && phi.survivorMode) {
            // Survivor Mars: fail if fewer than 3 tasks completed in time.
            if ((p.phiTasks ?? 0) < 3) { p.phiEliminated = true; p.alive = false; }
            else p.phiQualified = true;
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

    // Floor resolved early: nobody left who can still qualify.
    const remainingActive = state.players.filter(p => !p.phiEliminated && !p.phiQualified);
    if (remainingActive.length === 0) {
      if (!endMatchIfDone(state)) {
        beginTransition(state, survivors.length > 0 ? 'FLOOR COMPLETE' : 'FLOOR OVER');
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
