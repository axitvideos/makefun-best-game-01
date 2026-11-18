// Keyboard and pointer input for Emberwake.
// Held state gives a movement vector, a fire flag and the aim point (in field
// coordinates, converted by the callback main supplies, since the canvas is
// scaled to the window). One-shot presses (confirm, pause, dash, mute) queue as
// bit flags and are taken once by the loop, so a press between frames is never
// lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const FIRE_KEYS = new Set(['Space']);
const DASH_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyK']);
const MUTE_KEYS = new Set(['KeyM']);

export function createInput(target, toField) {
  const held = { up: false, down: false, left: false, right: false, fireKey: false };
  let actions = 0;
  let pointerDown = false;
  let pointerField = { x: 640, y: 200 };

  function updatePointer(event) {
    pointerField = toField(event.clientX, event.clientY);
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (FIRE_KEYS.has(event.code)) held.fireKey = true;
    else if (DASH_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE_KEYS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (FIRE_KEYS.has(event.code)) held.fireKey = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.fireKey = false;
    pointerDown = false;
  });
  target.addEventListener('pointermove', updatePointer);
  target.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    pointerDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised movement vector from the held keys (diagonals are not faster). */
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** The aim point in field coordinates. */
    aim() {
      return pointerField;
    },
    /** Firing while the mouse is held or Space is down. */
    firing() {
      return pointerDown || held.fireKey;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
