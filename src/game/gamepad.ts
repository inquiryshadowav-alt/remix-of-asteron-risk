/**
 * Simple gamepad polling. Maps controller buttons to keyboard events so the
 * existing keyboard-driven controls work identically with TV remotes / pads.
 *
 * A / Cross / OK  → 'e' (task interact) + Space (shoot / action)
 * B / Circle      → 'b' (build)
 * DPad Up/Down/Left/Right → '2','3','4','5' (Neon floor colors)
 * RT / R2         → Space (shoot)
 * Left stick      → WASD hold
 */

let attached = false;
let rafId = 0;
const held = new Set<string>();

function dispatch(key: string, down: boolean) {
  const type = down ? 'keydown' : 'keyup';
  window.dispatchEvent(new KeyboardEvent(type, { key }));
}

function edge(key: string, pressed: boolean) {
  const was = held.has(key);
  if (pressed && !was) { held.add(key); dispatch(key, true); }
  else if (!pressed && was) { held.delete(key); dispatch(key, false); }
}

function poll() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const b = gp.buttons;
    // Standard mapping: 0=A, 1=B, 2=X, 3=Y, 7=RT, 12=Up, 13=Down, 14=Left, 15=Right
    edge('e', !!b[0]?.pressed);
    edge(' ', !!b[0]?.pressed || !!b[7]?.pressed);
    edge('b', !!b[1]?.pressed);
    edge('2', !!b[12]?.pressed);
    edge('3', !!b[13]?.pressed);
    edge('4', !!b[14]?.pressed);
    edge('5', !!b[15]?.pressed);
    // Left stick → WASD
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    edge('a', ax < -0.4);
    edge('d', ax > 0.4);
    edge('w', ay < -0.4);
    edge('s', ay > 0.4);
    break;
  }
  rafId = requestAnimationFrame(poll);
}

export function startGamepadBridge() {
  if (attached) return;
  attached = true;
  rafId = requestAnimationFrame(poll);
}

export function stopGamepadBridge() {
  if (!attached) return;
  attached = false;
  cancelAnimationFrame(rafId);
  for (const k of held) dispatch(k, false);
  held.clear();
}
