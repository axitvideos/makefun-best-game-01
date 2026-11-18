// The screenshot scenes behind ?shot=play|title|victory|gameover.
// Each scene plays the real rules forward from a fresh world, steered by an
// autopilot, so every frame is a frame a player could reach, and the same seed
// always deals the same frame. The victory scene uses the careful pilot (it
// genuinely clears all six waves in most seeds; the screenshot script picks a
// seed where it does), the game-over scene a reckless one that holds its
// ground and is overrun, as a new player is.

import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** The nearest active, materialised enemy to a point, or null. */
function nearestEnemy(state, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active || enemy.spawnIn > 0) continue;
    const d = Math.hypot(enemy.x - x, enemy.y - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = enemy;
    }
  }
  return best;
}

/**
 * Build an input frame for the pilot. `careful` kites at range, strafes and
 * dashes out of trouble; `reckless` stands and fires.
 */
function pilotInput(state, careful) {
  const player = state.player;
  const enemy = nearestEnemy(state, player.x, player.y);
  let aim = enemy ? { x: enemy.x, y: enemy.y } : { x: player.x + Math.cos(player.angle) * 100, y: player.y + Math.sin(player.angle) * 100 };
  let move = { x: 0, y: 0 };
  let dash = false;
  if (careful && enemy) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const away = { x: dx / distance, y: dy / distance };
    const strafe = { x: -away.y, y: away.x };
    const want = distance < 190 ? 1 : distance > 300 ? -0.55 : 0;
    let mx = away.x * want + strafe.x * 0.65;
    let my = away.y * want + strafe.y * 0.65;
    // Keep off the walls: bias back toward the centre near an edge.
    if (player.x < 130) mx += 0.9;
    if (player.x > FIELD.width - 130) mx -= 0.9;
    if (player.y < 130) my += 0.9;
    if (player.y > FIELD.height - 130) my -= 0.9;
    const length = Math.hypot(mx, my) || 1;
    move = { x: mx / length, y: my / length };
    dash = distance < 95 && player.dashCooldown <= 0;
  }
  if (!careful && enemy) {
    // The reckless pilot charges the nearest husk and aims where it was, with
    // a wide wobbling error: it scores for a while, then gets overrun.
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    move = { x: dx / distance, y: dy / distance };
    const wobble = Math.sin(state.time * 2.7) * 46;
    aim = { x: enemy.x - enemy.vx * 0.3 + wobble, y: enemy.y - enemy.vy * 0.3 + wobble * 0.6 };
    return { move, aim, firing: true, dash: false };
  }
  // Lead the target a touch: aim where a mote is heading, not where it was.
  if (enemy) {
    aim.x += enemy.vx * 0.22;
    aim.y += enemy.vy * 0.22;
  }
  return { move, aim, firing: Boolean(enemy), dash };
}

const TITLE_SECONDS = 4;
const PLAY_SECONDS = 34;
const MAX_SECONDS = 900;

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Play forward and keep the busiest moment: the frame the shot shows is
    // the one with the most husks and bolts in flight, not an arbitrary second.
    let busiest = null;
    let busiestScore = -1;
    for (let t = 0; t < 80 / STEP; t += 1) {
      world.step(STEP, pilotInput(world.state, true));
      if (world.state.player.dead) break;
      if (t % 15 === 0 && world.state.time > 8) {
        const active = world.state.enemies.filter((e) => e.active).length;
        const central = world.state.enemies.filter((e) => e.active && e.x > 190 && e.x < FIELD.width - 190 && e.y > 120 && e.y < FIELD.height - 120).length;
        const bolts = world.state.bullets.filter((b) => b.active).length;
        const activity = central * 14 + active * 5 + bolts + (world.state.wave >= 2 ? 6 : 0);
        if (activity > busiestScore) {
          busiestScore = activity;
          busiest = structuredClone(world.state);
        }
        if (active >= 8) break;
      }
    }
    if (busiest) world.debugSet(busiest);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'victory') {
    let events = 0;
    for (let t = 0; t < MAX_SECONDS / STEP; t += 1) {
      events = world.step(STEP, pilotInput(world.state, true));
      if (events & (EVENT_WIN | EVENT_OVER)) break;
    }
    const won = world.state.waveState === 'won';
    return { screen: won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'gameover') {
    let events = 0;
    for (let t = 0; t < MAX_SECONDS / STEP; t += 1) {
      events = world.step(STEP, pilotInput(world.state, false));
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: Math.max(world.state.score, 400) };
  }
  // title: let the attract world drift for a few seconds behind the panel.
  for (let t = 0; t < TITLE_SECONDS / STEP; t += 1) {
    world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: FIELD.width / 2, y: 120 }, firing: false, dash: false }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
