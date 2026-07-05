# ASTERON Bug Fix + Polish Update

Large scope with 8 priorities. I'll batch related work into focused passes so each pass is verifiable.

## Terminology change

Rename all user-facing "bot"/"smart bot" strings to **"Local player"** across Settings, HUD, GameOver, toasts. Internal code keeps `isHuman=false`.

## Pass 1 — Floor 3 Performance (Malteron)

- Add 10s pre-round countdown ("Malteron Apocalypse begins in N…") shown ONLY at Floor 3 (spec says floor 4 but floor 3 is Malteron; treating as typo). Malterons don't spawn until countdown ends.
- Spawn Malterons only at curve endpoints / block corner path-nodes (not random block interiors).
- **Time-sliced AI:** each frame update only 3–4 Malterons (round-robin via `mRuntime.aiCursor`). Idle Malterons keep last velocity, no LOS or path recompute.
- Cache neighbor-block lookups per block (compute once at floor init).
- Skip player-Malteron distance checks beyond a coarse bounding-cell filter.

## Pass 2 — Floor 4 Frequency Fix + Maze polish

- Rewrite ring-vs-player resolution:
  - Sort intersections by contact time per player.
  - **First contact wins:** if player is immune to that color → survive, consume the immunity, ring loses effect **only for that player** (add `ring.consumedBy: Set<playerId>`), player color clears.
  - If first contact is wrong color → die.
  - Subsequent rings while consumed-immunity active: ignored for that player (per spec case C).
- Spawn placement: reject a candidate cell if another event ring already exists within 3 cells UNLESS candidate center lies inside an existing ring's current radius. Distribute across 4 map quadrants round-robin.
- Grid: 22×14, cell 104, wall thickness 4→6, add subtle inner shadow for readability.
- **Vision system:** 260px radius. Rings always visible (glow through darkness), dragon head has faint pre-vision aura, teammates/maze only within radius. Implement via mask overlay draw pass.

## Pass 3 — Dragon Train redesign

- Grey (#3a3d42) armored segments with red glow (#ff2233) chevrons, red eye slits, spike silhouettes; head has forward spikes and jaw.
- Speed 3.6→5.0 cells/s, larger trail (radial gradient + ember particles), motion blur behind head.
- Gameplay identical: same collision radius, same segment count.

## Pass 4 — UI overhaul

- `PhiHUD` restructured with CSS grid: top-left = floor title + countdown; top-center = alive/qualified; top-right = task progress (Mars). No overlapping absolute-positioned blocks.
- Adaptive: `clamp()` font sizes, safe-area padding.
- **Per-floor themes** via a `FLOOR_THEME` map (Mars orange/red, Electron green/lime, Malteron blue, Neon cyan/magenta). Applied to title, countdown, qualification banner, alerts.

## Pass 5 — Mobile controls

- `MobileControls`: keep joystick always. Action button set now floor-aware:
  - Mars → `TASK` button (E)
  - Malteron → `SHOOT` button
  - Nucleus → no action buttons
  - Neon → 4 buttons `2 3 4 5` colored to current mapping
- Detection reuses existing `useIsMobile`.

## Pass 6 — Preload + Referee

- Add `src/game/preload.ts` invoked at match start: preloads referee images, malteron/dead sprites, snake queen — resolves image `decode()` before first render.
- Referee overlay renders from cached images only.

## Pass 7 — Game Modes

- Settings adds mode picker: **Competition** (current) / **Survivor**.
- Survivor: `playerCount=1`, no bots, player-count control hidden. Match loops floors in random order forever until death.
- On death: GameOver shows `Floors Survived: X` and `Highest Record: Y` from `localStorage['asteron.survivor.best']`. No "won for now" text.

## Pass 8 — Spawns + Controller

- Each floor init picks player spawn positions from a shuffled pool (already partially done for Neon; extend to Mars/Malteron/Nucleus).
- Add `src/game/gamepad.ts` polling loop: map button 0 (A/Cross) → dispatch same key event as E. Works for task interact + Neon color buttons (dpad → 2/3/4/5), shoot (RT).
  pass 9-  Football Referee Image Optimization
    

  - Preload referee image when the game starts instead of loading them during fouls/cards.
  - Store referee images in memory/cache.
  - When a foul, yellow card occurs, instantly display the already-loaded referee image.
  - This prevents delayed rendering, missing sprites, and partial image loading caused by internet speed or browser lag.
  - Apply the same preloading system to other important UI assets and animations where possible.

## Files touched

- New: `src/game/preload.ts`, `src/game/gamepad.ts`, `src/game/phi/theme.ts`, `src/game/phi/countdown.ts`
- Edited: `types.ts`, `phi/malteronFloor.ts`, `phi/neonFloor.ts`, `phi/marsFloor.ts`, `phi/nucleusFloor.ts`, `phi/match.ts`, `phi/shared.ts`, `PhiHUD.tsx`, `MobileControls.tsx`, `SettingsScreen.tsx`, `GameCanvas.tsx`, `GameOverScreen.tsx`, `RefereeOverlay.tsx`, `Index.tsx`

## Out of scope

No new features beyond what's listed. Gameplay values unchanged unless explicitly noted (dragon speed, maze size).