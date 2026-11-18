// Emberwake's renderer: everything the player sees, drawn on one canvas in
// field coordinates (1280x720, letterboxed to the window). A parallax ember
// starfield, the arena, the skiff and the husks, bolts, pickups, particles,
// then the HUD and whichever screen is up: title, play, paused, victory or
// game over. All art is drawn in code; there are no image assets.

import { COMBO, FIELD, PALETTE, PLAYER, WAVES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

/** Fixed starfield, generated once from a constant seed so it never shimmers. */
const STARS = (() => {
  let s = 1234567;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    stars.push({ x: rnd() * FIELD.width, y: rnd() * FIELD.height, r: 0.6 + rnd() * 1.7, depth: 0.25 + rnd() * 0.75, warm: rnd() > 0.72 });
  }
  return stars;
})();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Convert a client (CSS pixel) point to field coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    return {
      x: Math.min(FIELD.width, Math.max(0, (px - offsetX) / scale)),
      y: Math.min(FIELD.height, Math.max(0, (py - offsetY) / scale)),
    };
  }

  function text(value, x, y, size, colour, align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px ${'system-ui, sans-serif'}`;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
  }

  function drawBackdrop(state) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const glow = ctx.createRadialGradient(FIELD.width / 2, FIELD.height * 0.42, 60, FIELD.width / 2, FIELD.height * 0.42, 640);
    glow.addColorStop(0, 'rgba(64, 52, 110, 0.55)');
    glow.addColorStop(1, 'rgba(11, 14, 26, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // The dawn line: a low ember horizon the whole game is defending.
    const horizon = ctx.createLinearGradient(0, FIELD.height - 90, 0, FIELD.height);
    horizon.addColorStop(0, 'rgba(255, 140, 70, 0)');
    horizon.addColorStop(1, 'rgba(255, 140, 70, 0.20)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, FIELD.height - 90, FIELD.width, 90);
    for (const star of STARS) {
      const drift = state.player ? state.player.x * 0.012 * star.depth : 0;
      const x = (star.x - drift + FIELD.width) % FIELD.width;
      const twinkle = 0.55 + 0.45 * Math.sin(state.time * (1 + star.depth) + star.x);
      ctx.globalAlpha = 0.35 + 0.4 * twinkle * star.depth;
      ctx.fillStyle = star.warm ? '#ffd9a0' : '#cfd8ff';
      ctx.beginPath();
      ctx.arc(x, star.y, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arena frame.
    ctx.strokeStyle = 'rgba(90, 104, 178, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, FIELD.width - 12, FIELD.height - 12);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, FIELD.width - 24, FIELD.height - 24);
  }

  function drawPickup(pickup, time) {
    const bob = Math.sin(pickup.phase) * 3;
    const y = pickup.y + bob;
    const blink = pickup.life < 2 ? (Math.sin(time * 14) > 0 ? 1 : 0.25) : 1;
    ctx.globalAlpha = blink;
    if (pickup.kind === 'shard') {
      ctx.fillStyle = PALETTE.shard;
      ctx.save();
      ctx.translate(pickup.x, y);
      ctx.rotate(Math.PI / 4 + Math.sin(pickup.phase * 0.6) * 0.3);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    } else if (pickup.kind === 'heal') {
      ctx.fillStyle = PALETTE.heal;
      ctx.beginPath();
      ctx.arc(pickup.x, y, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b2e1a';
      ctx.fillRect(pickup.x - 2, y - 6, 4, 12);
      ctx.fillRect(pickup.x - 6, y - 2, 12, 4);
    } else {
      ctx.strokeStyle = PALETTE.surge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pickup.x, y, 10, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = PALETTE.surge;
      ctx.beginPath();
      ctx.moveTo(pickup.x + 2, y - 7);
      ctx.lineTo(pickup.x - 4, y + 1);
      ctx.lineTo(pickup.x, y + 1);
      ctx.lineTo(pickup.x - 2, y + 7);
      ctx.lineTo(pickup.x + 4, y - 1);
      ctx.lineTo(pickup.x, y - 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy, time) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.spawnIn > 0) {
      // A warning ring that closes as the husk materialises.
      const p = 1 - enemy.spawnIn / 0.55;
      ctx.strokeStyle = 'rgba(255, 93, 143, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 16 - p * 10, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + p * 0.5;
    }
    const flash = enemy.flash > 0.4;
    if (enemy.kind === 'mote') {
      ctx.rotate(enemy.angle);
      ctx.fillStyle = flash ? '#ffffff' : PALETTE.mote;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-9, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.moteCore;
      ctx.beginPath();
      ctx.arc(2, 0, 4.5, 0, TAU);
      ctx.fill();
    } else if (enemy.kind === 'wisp') {
      ctx.rotate(enemy.angle);
      if (enemy.mode === 'telegraph') {
        ctx.strokeStyle = `rgba(255, 93, 143, ${0.35 + 0.35 * Math.sin(time * 30)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(120, 0);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? '#ffffff' : PALETTE.wisp;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-12, -13);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-12, 13);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.wispCore;
      ctx.beginPath();
      ctx.arc(3, 0, 4, 0, TAU);
      ctx.fill();
    } else {
      ctx.rotate(enemy.angle);
      ctx.fillStyle = flash ? '#ffffff' : PALETTE.bloom;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 15, Math.sin(a) * 15, 10.5, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.bloomCore;
      ctx.beginPath();
      ctx.arc(0, 0, 7 + Math.sin(time * 5 + enemy.phase) * 1.4, 0, TAU);
      ctx.fill();
      // Hull pips over a bloom, the only husk that takes real work.
      if (enemy.hull < enemy.maxHull) {
        ctx.rotate(-enemy.angle);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-18, -34, 36, 5);
        ctx.fillStyle = PALETTE.bloomCore;
        ctx.fillRect(-18, -34, 36 * (enemy.hull / enemy.maxHull), 5);
      }
    }
    ctx.restore();
  }

  function drawPlayer(player, time) {
    if (player.dead) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    // Dash cooldown ghost ring.
    ctx.rotate(player.angle);
    const flicker = player.invulnerable > 0 && player.dashTimer <= 0 ? (Math.sin(time * 34) > 0 ? 0.45 : 0.9) : 1;
    ctx.globalAlpha = flicker;
    // Flame.
    const flame = 12 + Math.sin(time * 26) * 3 + (player.dashTimer > 0 ? 12 : 0);
    const grad = ctx.createLinearGradient(-14, 0, -14 - flame, 0);
    grad.addColorStop(0, 'rgba(255, 217, 138, 0.95)');
    grad.addColorStop(1, 'rgba(255, 120, 71, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-14 - flame, 0);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fill();
    // Hull of the skiff: a sleek lantern prowed dart.
    ctx.fillStyle = PALETTE.skiff;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-14, 13);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.skiffTrim;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-2, -4.5);
    ctx.lineTo(-2, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6dd';
    ctx.beginPath();
    ctx.arc(6, 0, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (player.surgeTimer > 0) {
      ctx.strokeStyle = `rgba(90, 210, 255, ${0.5 + 0.3 * Math.sin(time * 10)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 22, 0, TAU);
      ctx.stroke();
    }
  }

  function drawWorld(state) {
    drawBackdrop(state);
    for (const pickup of state.pickups) if (pickup.active) drawPickup(pickup, state.time);
    for (const enemy of state.enemies) if (enemy.active) drawEnemy(enemy, state.time);
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      ctx.strokeStyle = PALETTE.bolt;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    drawPlayer(state.player, state.time);
    for (const particle of state.particles) {
      if (!particle.active) continue;
      const lifeP = particle.life / particle.maxLife;
      ctx.globalAlpha = Math.max(0, lifeP);
      if (particle.ring) {
        ctx.strokeStyle = particle.colour;
        ctx.lineWidth = 3 * lifeP;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.colour;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * lifeP + 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = `700 15px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.texts) {
      if (!t.active) continue;
      ctx.globalAlpha = Math.min(1, t.life * 1.6);
      ctx.fillStyle = t.colour;
      ctx.fillText(t.value, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 60, 60, ${state.flash * 0.22})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state, best) {
    const player = state.player;
    // Top-left: hull bar.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(22, 18, 264, 20, 8);
    ctx.fill();
    const hullP = Math.max(0, player.hull / PLAYER.hull);
    ctx.fillStyle = hullP > 0.3 ? PALETTE.hull : PALETTE.hullLow;
    if (hullP > 0) {
      ctx.beginPath();
      ctx.roundRect(24, 20, 260 * hullP, 16, 7);
      ctx.fill();
    }
    text(`HULL ${Math.ceil(player.hull)}`, 34, 29, 13, '#0c1410', 'left', 800);
    if (player.surgeTimer > 0) text(`SURGE ${player.surgeTimer.toFixed(0)}s`, 34, 56, 14, PALETTE.surge, 'left', 700);
    // Dash meter under the hull.
    const dashP = 1 - Math.max(0, player.dashCooldown) / 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(22, 44, 120, 6);
    ctx.fillStyle = PALETTE.surge;
    ctx.fillRect(22, 44, 120 * dashP, 6);
    text('DASH', 150, 47, 11, PALETTE.muted, 'left', 700);

    // Top-centre: wave.
    const waveLabel = state.waveState === 'won' ? 'DAWN' : `WAVE ${Math.min(state.wave + 1, WAVES.length)} / ${WAVES.length}`;
    text(waveLabel, FIELD.width / 2, 30, 21, PALETTE.text, 'center', 800);
    const remaining = state.spawnQueue.length + state.enemies.filter((e) => e.active).length;
    if (state.waveState === 'active') text(`${remaining} husks remain`, FIELD.width / 2, 56, 14, PALETTE.muted);

    // Top-right: score, combo, best.
    text(`${state.score}`, FIELD.width - 24, 28, 26, PALETTE.dawn, 'right', 800);
    text(`BEST ${Math.max(best, state.score)}`, FIELD.width - 24, 54, 13, PALETTE.muted, 'right', 700);
    if (state.combo >= 2) {
      const comboP = Math.max(0, state.comboTimer / COMBO.window);
      text(`COMBO x${state.multiplier}  (${state.combo})`, FIELD.width - 24, 80, 15, PALETTE.ember, 'right', 800);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(FIELD.width - 124, 92, 100, 5);
      ctx.fillStyle = PALETTE.ember;
      ctx.fillRect(FIELD.width - 124, 92, 100 * comboP, 5);
    }
    text(`SHARDS ${state.shardsCollected}`, FIELD.width - 24, 116, 13, PALETTE.shard, 'right', 700);
  }

  function drawBanner(state) {
    if (state.waveState === 'banner') {
      text(`WAVE ${state.wave + 1}`, FIELD.width / 2, FIELD.height / 2 - 30, 54, PALETTE.dawn, 'center', 800);
      text(state.wave === 0 ? 'The gloam comes for the dawn embers.' : state.wave === WAVES.length - 1 ? 'Last wave. Hold the line!' : 'More husks on the wake.', FIELD.width / 2, FIELD.height / 2 + 22, 19, PALETTE.text);
    } else if (state.waveState === 'cleared') {
      text('WAVE CLEAR', FIELD.width / 2, FIELD.height / 2 - 20, 40, PALETTE.heal, 'center', 800);
    }
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(7, 9, 20, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('EMBERWAKE', FIELD.width / 2, 168, 84, PALETTE.dawn, 'center', 800);
    text('H O L D   T H E   D A W N   L I N E', FIELD.width / 2, 224, 21, PALETTE.ember, 'center', 700);
    panel(FIELD.width / 2 - 330, 262, 660, 196);
    text('Pilot the lantern skiff. Burn back six waves of gloam husks', FIELD.width / 2, 292, 18, PALETTE.text);
    text('before they snuff the dawn embers — clear wave 6 and dawn breaks.', FIELD.width / 2, 318, 18, PALETTE.text);
    text('MOVE  WASD / Arrows        AIM  Mouse        FIRE  Hold Click / Space', FIELD.width / 2, 356, 16, PALETTE.dawn, 'center', 700);
    text('DASH  Shift (briefly untouchable)        PAUSE  P        MUTE  M', FIELD.width / 2, 384, 16, PALETTE.dawn, 'center', 700);
    text('Chain kills to raise the combo multiplier. Catch shards,', FIELD.width / 2, 418, 15, PALETTE.muted);
    text('mending sparks and surge cells as they fall.', FIELD.width / 2, 440, 15, PALETTE.muted);
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    text('PRESS ENTER OR CLICK TO BEGIN', FIELD.width / 2, 512, 24, PALETTE.heal, 'center', 800);
    ctx.globalAlpha = 1;
    if (best > 0) text(`BEST SCORE ${best}`, FIELD.width / 2, 552, 16, PALETTE.muted);
    text('An original game of embers and gloam — art, sound and code made for this run.', FIELD.width / 2, 664, 13, PALETTE.muted);
  }

  function statsLines(state, best) {
    return [
      `SCORE  ${state.score}`,
      `BEST  ${Math.max(best, state.score)}`,
      `HUSKS BURNED  ${state.kills}      SHARDS  ${state.shardsCollected}      WAVES CLEARED  ${state.waveState === 'won' ? WAVES.length : state.wave}`,
    ];
  }

  function drawEnd(state, best, won) {
    drawHud(state, best);
    ctx.fillStyle = won ? 'rgba(24, 20, 6, 0.55)' : 'rgba(16, 6, 10, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(won ? 'DAWN BREAKS' : 'THE WAKE GOES DARK', FIELD.width / 2, 218, 58, won ? PALETTE.dawn : PALETTE.danger, 'center', 800);
    text(won ? 'Every ember held. The valley wakes in light.' : `The gloam took the embers on wave ${state.wave + 1}.`, FIELD.width / 2, 268, 19, PALETTE.text);
    panel(FIELD.width / 2 - 300, 302, 600, 118);
    const lines = statsLines(state, best);
    text(lines[0], FIELD.width / 2, 334, 24, PALETTE.dawn, 'center', 800);
    text(lines[1], FIELD.width / 2, 368, 16, PALETTE.muted, 'center', 700);
    text(lines[2], FIELD.width / 2, 396, 15, PALETTE.text, 'center', 600);
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    text('PRESS ENTER OR CLICK TO PLAY AGAIN', FIELD.width / 2, 478, 22, PALETTE.heal, 'center', 800);
    ctx.globalAlpha = 1;
  }

  return {
    toField,
    /** Draw the world and the given screen. `best` is the stored best score. */
    draw(state, screen, best) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05060d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      // Screen shake: offset by the world's shake, scaled down as it decays.
      if (state && state.shake > 0.2 && screen === SCREEN_PLAY) {
        const s = state.shake;
        ctx.translate((Math.sin(state.time * 91) * s) / 2, (Math.cos(state.time * 83) * s) / 2);
      }
      drawWorld(state);
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_PLAY) {
        drawHud(state, best);
        drawBanner(state);
      } else if (screen === SCREEN_PAUSED) {
        drawHud(state, best);
        ctx.fillStyle = 'rgba(7, 9, 20, 0.55)';
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
        text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 16, 46, PALETTE.text, 'center', 800);
        text('Press P or Enter to resume', FIELD.width / 2, FIELD.height / 2 + 30, 17, PALETTE.muted);
      } else if (screen === SCREEN_WIN) drawEnd(state, best, true);
      else if (screen === SCREEN_OVER) drawEnd(state, best, false);
    },
  };
}
