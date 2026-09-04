import { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, ARREST_RANGE, DOOR_USE_COOLDOWN } from '@/game/types';
import { updateGame, humanKill, humanArrest, getNearbyTask, getNearbyDoor, toggleDoor, rangeForAbility, placeBuilderBlock } from '@/game/engine';
import { generateTaskChallenge } from '@/game/tasks';
import { renderGame } from '@/game/renderer';
import { updatePhi, renderPhi } from '@/game/phi/match';
import TaskOverlay from './TaskOverlay';
import MobileControls from './MobileControls';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import RotateDevicePrompt from './RotateDevicePrompt';
import DraggableExitButton from './DraggableExitButton';
import RefereeOverlay from './RefereeOverlay';
import PhiHUD from './PhiHUD';
import DeathOverlay from './DeathOverlay';
import RankingBoard from './RankingBoard';
import { preloadGameAssets, DRAGON_AUDIO_SRC } from '@/game/preload';
import { startGamepadBridge, stopGamepadBridge } from '@/game/gamepad';
import { playSfx, preloadSfx, stopAllLoops } from '@/game/audio';
import { awardXP } from '@/game/phi/shared';

interface Props {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  onExit?: () => void;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function GameCanvas({ gameState, setGameState, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const stateRef = useRef(gameState);
  const animRef = useRef(0);
  const mobileDir = useRef({ x: 0, y: 0 });
  const lastArrestEventRef = useRef(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [showTask, setShowTask] = useState(false);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();
  const needsRotate = isMobile && isPortrait;

  stateRef.current = gameState;

  useEffect(() => {
    const resize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  // Preload critical assets + gamepad bridge (once per mount).
  useEffect(() => {
    preloadGameAssets();
    preloadSfx();
    startGamepadBridge();
    return () => { stopGamepadBridge(); stopAllLoops(); };
  }, []);

  // Dragon Chase looping audio — active only on Neon floor. Volume scales
  // with distance from player to nearest dragon segment.
  const dragonAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = new Audio(DRAGON_AUDIO_SRC);
    a.loop = true;
    a.volume = 0;
    a.preload = 'auto';
    dragonAudioRef.current = a;
    return () => { a.pause(); a.src = ''; dragonAudioRef.current = null; };
  }, []);



  // On mobile, request fullscreen on the first user interaction (browsers
  // require a user gesture). Also try to lock orientation to landscape.
  useEffect(() => {
    if (!isMobile) return;
    const goFullscreen = async () => {
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          await el.requestFullscreen();
        }
        const orient = (screen as any).orientation;
        if (orient && typeof orient.lock === 'function') {
          orient.lock('landscape').catch(() => {});
        }
      } catch {}
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
    window.addEventListener('touchstart', goFullscreen, { once: true });
    window.addEventListener('click', goFullscreen, { once: true });
    return () => {
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
  }, [isMobile]);

  const handleKey = useCallback((e: KeyboardEvent, down: boolean) => {
    // Desktop-only: ignore all keyboard input on mobile devices.
    if (isMobile) return;
    // While a task overlay is open we still process key-UPs, otherwise the
    // release is swallowed and the player keeps sliding after the overlay
    // closes.
    if (showTask) {
      if (!down) keysRef.current.delete(e.key.toLowerCase());
      return;
    }



    const key = e.key.toLowerCase();
    if (down) {
      keysRef.current.add(key);
      if (key === ' ' || key === 'space' || key === 'enter') {
        e.preventDefault();
        const now = performance.now();
        const s = stateRef.current;
          const ab = s.players[0].ability;
          if (ab === 'kill' || ab === 'shooter') humanKill(s, now);
          else if (ab === 'jail') humanArrest(s, now);
        else {
          const taskId = getNearbyTask(s);
          if (taskId !== null) {
            const station = s.taskStations.find(t => t.id === taskId);
            if (station) {
              const challenge = generateTaskChallenge(station);
              s.activeTask = challenge;
              s.players[0].doingTask = true;
              s.players[0].taskStationId = taskId;
              setShowTask(true);
              setGameState({ ...s });
            }
          }
        }
      }
      if (key === 'e') {
        e.preventDefault();
        const s = stateRef.current;
        // Door takes priority
        const doorId = getNearbyDoor(s);
        if (doorId !== null) {
          const door = s.doors.find(d => d.id === doorId)!;
          if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
            s.activeTask = {
              type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
              answer: '', doorId, doorAction: door.open ? 'close' : 'open',
            };
            s.players[0].doingTask = true;
            setShowTask(true);
            setGameState({ ...s });
          }
          return;
        }
        const taskId = getNearbyTask(s);
        if (taskId !== null) {
          const station = s.taskStations.find(t => t.id === taskId);
          if (station) {
            const challenge = generateTaskChallenge(station);
            s.activeTask = challenge;
            s.players[0].doingTask = true;
            s.players[0].taskStationId = taskId;
            setShowTask(true);
            setGameState({ ...s });
          }
        }
      }
      if (key === 'b') {
        e.preventDefault();
        const s = stateRef.current;
        const human = s.players[0];
        if (human.alive && !human.jailed && (human.builderCharges ?? 0) > 0) {
          placeBuilderBlock(s, human, performance.now());
          setGameState({ ...s });
        }
      }
    } else {
      keysRef.current.delete(key);
    }
  }, [showTask, setGameState, isMobile]);

  useEffect(() => {
    // Only register keyboard listeners on desktop.
    if (isMobile) return;
    const kd = (e: KeyboardEvent) => handleKey(e, true);
    const ku = (e: KeyboardEvent) => handleKey(e, false);
    // Clear all held keys if the window loses focus — otherwise a keyup
    // fired while another window/tab is focused is missed and the player
    // keeps moving indefinitely.
    const clear = () => keysRef.current.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [handleKey, isMobile]);

  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(time - lastTime, 50);
      lastTime = time;

      // Apply mobile joystick direction
      const human = stateRef.current.players[0];
      const isPhiMode = stateRef.current.mode === 'phi';
      if (isMobile && human.alive && (isPhiMode ? !human.phiEliminated && !human.doingTask : !human.doingTask)) {
        human.direction = { ...mobileDir.current };
      } else if (isMobile && (human.doingTask || human.phiEliminated)) {
        human.direction = { x: 0, y: 0 };
      }


      if (stateRef.current.phase === 'playing') {
        const isPhi = stateRef.current.mode === 'phi';
        const newState = isPhi
          ? updatePhi(stateRef.current, dt, keysRef.current, time, isMobile)
          : updateGame(stateRef.current, dt, keysRef.current, time, isMobile);
        stateRef.current = newState;
        setGameState(newState);

        // Arrest sound effect
        const ra = newState.recentArrest;
        if (ra && ra.eventId !== lastArrestEventRef.current) {
          lastArrestEventRef.current = ra.eventId;
          try {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AC) {
              const ctx = new AC();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'square';
              o.frequency.setValueAtTime(880, ctx.currentTime);
              o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
              g.gain.setValueAtTime(0.18, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              o.connect(g); g.connect(ctx.destination);
              o.start(); o.stop(ctx.currentTime + 0.4);
            }
          } catch {}
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (stateRef.current.mode === 'phi') renderPhi(ctx, stateRef.current, size.w, size.h);
          else renderGame(ctx, stateRef.current, size.w, size.h);
        }
      }

      // Dragon Chase audio — active only on Neon floor.
      const audio = dragonAudioRef.current;
      if (audio) {
        const s = stateRef.current;
        const phi = s.phi;
        const onNeon = s.mode === 'phi' && phi
          && phi.floorSequence[phi.currentFloorIdx] === 'neon'
          && phi.floorPhase === 'active'
          && phi.neon;
        if (onNeon) {
          const h = s.players[0];
          const segs = phi.neon!.dragon.segments;
          let nearest = Infinity;
          for (const seg of segs) {
            const d = Math.hypot(seg.x - h.x, seg.y - h.y);
            if (d < nearest) nearest = d;
          }
          // Distance-to-volume: <=180 -> 0.7, ~450 -> 0.10, >=900 -> 0
          let vol = 0;
          if (nearest <= 180) vol = 0.7;
          else if (nearest <= 450) {
            const t = (450 - nearest) / (450 - 180);
            vol = 0.10 + t * (0.7 - 0.10);
          } else if (nearest <= 900) {
            const t = (900 - nearest) / (900 - 450);
            vol = t * 0.10;
          }
          audio.volume = Math.max(0, Math.min(1, vol));
          if (audio.paused) audio.play().catch(() => {});
        } else if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, setGameState, isMobile]);

  const handleTaskComplete = useCallback(() => {
    const s = stateRef.current;
    if (s.activeTask && s.activeTask.type === 'door' && s.activeTask.doorId !== undefined) {
      toggleDoor(s, s.activeTask.doorId, performance.now());
    } else if (s.activeTask) {
      const station = s.taskStations.find(t => t.id === s.activeTask!.stationId);
      if (station && !station.completed) {
        station.completed = true;
        s.tasksCompleted++;
        playSfx('taskWin', 0.6, 2200);
        // PHI Mars: +1 XP per task completed.
        if (s.mode === 'phi') {
          const h = s.players[0];
          h.phiTasks = (h.phiTasks ?? 0) + 1;
          awardXP(h, 1);
          if (s.phi?.survivorMode && (h.phiTasks ?? 0) >= 3 && !h.phiQualified) {
            h.phiQualified = true;
            s.phi.banner = {
              text: 'QUALIFIED — 3 TASKS COMPLETE',
              until: performance.now() + 2600,
            };
          }
        }
      }
    }
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleTaskCancel = useCallback(() => {
    const s = stateRef.current;
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleMobileMove = useCallback((dx: number, dy: number) => {
    mobileDir.current = { x: dx, y: dy };
  }, []);

  const handleMobileAction = useCallback(() => {
    const s = stateRef.current;
    const now = performance.now();
      const ab = s.players[0].ability;
      if (ab === 'kill' || ab === 'shooter') {
      humanKill(s, now);
      } else if (ab === 'jail') {
      humanArrest(s, now);
      } else if (ab === 'crew') {
      // Door has priority
      const doorId = getNearbyDoor(s);
      if (doorId !== null) {
        const door = s.doors.find(d => d.id === doorId)!;
        if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
          s.activeTask = {
            type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
            answer: '', doorId, doorAction: door.open ? 'close' : 'open',
          };
          s.players[0].doingTask = true;
          setShowTask(true);
          setGameState({ ...s });
          return;
        }
      }
      const taskId = getNearbyTask(s);
      if (taskId !== null) {
        const station = s.taskStations.find(t => t.id === taskId);
        if (station) {
          const challenge = generateTaskChallenge(station);
          s.activeTask = challenge;
          s.players[0].doingTask = true;
          s.players[0].taskStationId = taskId;
          setShowTask(true);
          setGameState({ ...s });
        }
      }
    }
  }, [setGameState]);

  const handleMobileBuild = useCallback(() => {
    const s = stateRef.current;
    const human = s.players[0];
    if (human.alive && !human.jailed && (human.builderCharges ?? 0) > 0) {
      placeBuilderBlock(s, human, performance.now());
      setGameState({ ...s });
    }
  }, [setGameState]);

  // Determine action button state for mobile (PHI-mode floors first).
  const human = gameState.players[0];
  let actionLabel = '';
  let canAction = false;
  let phiNeonKeys: Array<{ key: '2' | '3' | '4' | '5'; color: string }> | null = null;
  const isPhi = gameState.mode === 'phi';
  const phiFloor = isPhi ? gameState.phi?.floorSequence[gameState.phi.currentFloorIdx] : undefined;

  if (isPhi && phiFloor === 'malteron') {
    actionLabel = 'SHOOT';
    canAction = !human.phiEliminated && (human.phiBullets ?? 0) > 0;
  } else if (isPhi && phiFloor === 'nucleus') {
    actionLabel = ''; // no action button
    canAction = false;
  } else if (isPhi && phiFloor === 'neon') {
    const neon = gameState.phi?.neon;
    const HEX: Record<string, string> = { GREEN: '#5fff8a', WHITE: '#f5f7ff', BLUE: '#57b8ff', RED: '#ff5a6b' };
    if (neon) phiNeonKeys = (['2', '3', '4', '5'] as const).map(k => ({ key: k, color: HEX[neon.mapping[k]] }));
    actionLabel = '';
    canAction = false;
  } else if (isPhi && phiFloor === 'mars') {
    actionLabel = 'TASK';
    canAction = getNearbyTask(gameState) !== null;
  } else if (gameState.mode === 'football') {
    // Kicking is automatic on ball contact; button is a visual affordance
    // and (if available) uses a Power-Shot charge for the next hit.
    actionLabel = 'KICK';
    canAction = human.alive;
  } else {
    const hAb = human.ability;
    if (hAb === 'kill' || hAb === 'shooter') {
      actionLabel = hAb === 'shooter' ? 'SHOOT' : 'KILL';
      const range = rangeForAbility(hAb);
      canAction = human.alive && !human.jailed && human.killCooldown <= 0 &&
        gameState.players.some(p => p.alive && p.id !== 0 && p.team !== human.team && dist(human, p) < range);
    } else if (hAb === 'jail') {
      actionLabel = 'ARREST';
      canAction = human.alive && !human.jailed && human.arrestCooldown <= 0 &&
        gameState.players.some(p => p.alive && p.id !== 0 && !p.jailed && p.team !== human.team && dist(human, p) < ARREST_RANGE);
    } else {
      const doorId = getNearbyDoor(gameState);
      if (doorId !== null) {
        const door = gameState.doors.find(d => d.id === doorId)!;
        actionLabel = door.open ? 'CLOSE' : 'OPEN';
        canAction = (performance.now() - door.lastUsedAt) >= DOOR_USE_COOLDOWN;
      } else {
        actionLabel = 'TASK';
        canAction = getNearbyTask(gameState) !== null;
      }
    }
  }

  // Simple mobile helpers for PHI-specific actions (route through keys set).
  const phiTap = useCallback((k: string) => {
    keysRef.current.add(k);
    setTimeout(() => keysRef.current.delete(k), 120);
  }, []);


  return (
    <>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="block"
        style={{ cursor: isMobile ? 'none' : 'default', touchAction: 'none' }}
        onClick={() => {
          if (isMobile) return;
          const s = stateRef.current;
          const now = performance.now();
          const ab = s.players[0].ability;
          if (ab === 'kill' || ab === 'shooter') humanKill(s, now);
          else if (ab === 'jail') humanArrest(s, now);
        }}
      />
      {showTask && gameState.activeTask && (
        <TaskOverlay
          task={gameState.activeTask}
          onComplete={handleTaskComplete}
          onCancel={handleTaskCancel}
        />
      )}
      {isMobile && !showTask && gameState.phase === 'playing' && (
        <>
          <MobileControls
            role={human.role}
            ability={human.ability}
            team={human.team}
            canAction={canAction && !!actionLabel}
            actionLabel={actionLabel || ' '}
            onMove={handleMobileMove}
            onAction={() => {
              if (isPhi && phiFloor === 'malteron') phiTap(' ');
              else if (isPhi && phiFloor === 'mars') handleMobileAction();
              else handleMobileAction();
            }}
            builderCharges={human.builderCharges ?? 0}
            onBuild={handleMobileBuild}
          />
          {phiNeonKeys && (
            <div className="fixed z-40 pointer-events-none" style={{ bottom: 50, right: 30, display: 'flex', gap: 10 }}>
              {phiNeonKeys.map(({ key, color }) => (
                <button
                  key={key}
                  className="pointer-events-auto"
                  style={{
                    width: 62, height: 62, borderRadius: '50%',
                    background: color, border: '3px solid white',
                    color: '#000', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 22,
                    boxShadow: `0 0 18px ${color}`,
                  }}
                  onTouchStart={(e) => { e.preventDefault(); phiTap(key); }}
                >{key}</button>
              ))}
            </div>
          )}
        </>
      )}
      {needsRotate && <RotateDevicePrompt />}
      {gameState.refereeActive && gameState.refereeMessage && (
        <RefereeOverlay message={gameState.refereeMessage} />
      )}
      {gameState.mode === 'phi' && <PhiHUD state={gameState} />}
      {gameState.mode === 'phi' && !gameState.phi?.survivorMode && gameState.phase === 'playing' && (
        <RankingBoard state={gameState} />
      )}
      {gameState.mode === 'phi' && (
        <DeathOverlay state={gameState} onLeave={() => onExit && onExit()} />
      )}
      {onExit && <DraggableExitButton onExit={onExit} />}
    </>
  );
}
