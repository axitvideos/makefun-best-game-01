// Emberwake tuning: every number and colour the game runs on, in one place.
// The playfield is a fixed 1280x720 logical arena; the renderer scales it to the
// window, so no rule below depends on the player's screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 345,
  acceleration: 2400,
  friction: 6.5,
  hull: 100,
  fireInterval: 0.145,
  surgeFireInterval: 0.07,
  bulletSpeed: 780,
  bulletRadius: 4,
  bulletLife: 0.9,
  dashSpeed: 920,
  dashTime: 0.16,
  dashCooldown: 1.5,
  hurtInvulnerable: 0.7,
};

export const COMBO = {
  /** Kills that raise the score multiplier by one, and the multiplier's cap. */
  killsPerTier: 8,
  maxMultiplier: 5,
  /** Seconds without a kill before the combo (and its multiplier) fades. */
  window: 3.2,
};

export const ENEMY_KINDS = {
  mote: {
    radius: 13, hull: 1, speed: 126, damage: 10, points: 40,
    turn: 3.4, wobble: 2.2,
  },
  wisp: {
    radius: 12, hull: 2, speed: 96, damage: 14, points: 70,
    keepDistance: 210, telegraph: 0.55, chargeSpeed: 520, chargeTime: 0.42, restTime: 0.8,
  },
  bloom: {
    radius: 24, hull: 4, speed: 58, damage: 18, points: 120,
    turn: 1.6, children: 2,
  },
};

export const PICKUPS = {
  radius: 10,
  magnetRange: 96,
  magnetSpeed: 320,
  life: 9,
  shardPoints: 25,
  healAmount: 22,
  surgeTime: 8,
  /** Chance a killed enemy drops a dawn shard; a bloom always drops one. */
  shardChance: 0.34,
  healChance: 0.07,
  surgeChance: 0.05,
};

/** The run: six waves, then dawn breaks and the player wins. Counts are per kind. */
export const WAVES = [
  { mote: 6, wisp: 0, bloom: 0 },
  { mote: 9, wisp: 2, bloom: 0 },
  { mote: 10, wisp: 3, bloom: 1 },
  { mote: 13, wisp: 4, bloom: 2 },
  { mote: 15, wisp: 6, bloom: 3 },
  { mote: 18, wisp: 7, bloom: 4 },
];

/** Enemy speed and hull creep so later waves bite harder than the counts alone. */
export const WAVE_SCALING = { speedPerWave: 0.07, spawnInterval: 0.85, spawnPerWave: 0.06 };

export const POOLS = { enemies: 96, bullets: 220, particles: 420, pickups: 48, texts: 32 };

export const PALETTE = {
  backdrop: '#0b0e1a',
  deep: '#11152a',
  grid: '#1c2342',
  ember: '#ffb347',
  emberHot: '#ff7847',
  dawn: '#ffe9a8',
  skiff: '#ffd98a',
  skiffTrim: '#ff8c5a',
  bolt: '#ffe9a8',
  mote: '#8f7bff',
  moteCore: '#d6ccff',
  wisp: '#ff5d8f',
  wispCore: '#ffd3e2',
  bloom: '#c94fd6',
  bloomCore: '#f3c6ff',
  shard: '#ffc857',
  heal: '#6dffa8',
  surge: '#5ad2ff',
  hull: '#7dff9a',
  hullLow: '#ff5d5d',
  text: '#f4ecd9',
  muted: '#9aa3c7',
  danger: '#ff6b6b',
  panel: 'rgba(13, 16, 34, 0.78)',
  panelEdge: '#39406e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberwake.best';
