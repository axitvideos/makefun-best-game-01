// Emberwake's simulation: the player skiff, three kinds of gloam husk, dawn
// bolts, pickups, particles and floating score text, advanced in fixed steps.
// It knows nothing about the DOM: main feeds it an input frame each step and it
// answers with event flags the caller turns into sound and announcements.
//
// The loop of a run: waves of husks drift in from the arena edges. Shooting a
// husk builds the combo (and with it the score multiplier); a bloom husk splits
// into motes when it dies. Husks that reach the skiff tear its hull. Clear all
// six waves and dawn breaks (a win); lose the hull and the wake goes dark.

import { COMBO, ENEMY_KINDS, FIELD, PICKUPS, PLAYER, POOLS, WAVES, WAVE_SCALING } from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT_ENEMY = 2;
export const EVENT_KILL = 4;
export const EVENT_HURT = 8;
export const EVENT_PICKUP = 16;
export const EVENT_DASH = 32;
export const EVENT_WAVE = 64;
export const EVENT_WIN = 128;
export const EVENT_OVER = 256;

export const PICKUP_SHARD = 'shard';
export const PICKUP_HEAL = 'heal';
export const PICKUP_SURGE = 'surge';

const TAU = Math.PI * 2;

function makePool(size, factory) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(factory());
  return pool;
}

function freeOf(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    shotsFired: 0,
    shardsCollected: 0,
    wave: 0,
    waveState: 'banner', // banner -> active -> cleared (between waves)
    waveTimer: 1.6,
    spawnQueue: [],
    spawnTimer: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    shake: 0,
    hitStop: 0,
    flash: 0,
    lastPickup: '',
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    texts: [],
  };

  state.enemies = makePool(POOLS.enemies, () => ({
    active: false, kind: 'mote', x: 0, y: 0, vx: 0, vy: 0, hull: 1, maxHull: 1,
    radius: 12, phase: 0, mode: 'seek', modeTimer: 0, spawnIn: 0, flash: 0, angle: 0,
  }));
  state.bullets = makePool(POOLS.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  state.particles = makePool(POOLS.particles, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, colour: '#fff', drag: 1, ring: false,
  }));
  state.pickups = makePool(POOLS.pickups, () => ({ active: false, kind: PICKUP_SHARD, x: 0, y: 0, vx: 0, vy: 0, life: 0, phase: 0 }));
  state.texts = makePool(POOLS.texts, () => ({ active: false, x: 0, y: 0, life: 0, value: '', colour: '#fff' }));

  function resetPlayer() {
    state.player = {
      x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
      hull: PLAYER.hull, angle: -Math.PI / 2,
      fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashDirX: 1, dashDirY: 0,
      invulnerable: 0, surgeTimer: 0, trailTimer: 0, dead: false,
    };
  }

  function buildWaveQueue(index) {
    const spec = WAVES[index];
    const queue = [];
    for (let i = 0; i < spec.bloom; i += 1) queue.push('bloom');
    for (let i = 0; i < spec.wisp; i += 1) queue.push('wisp');
    for (let i = 0; i < spec.mote; i += 1) queue.push('mote');
    // Shuffle so kinds arrive mixed, blooms never first.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    if (queue[0] === 'bloom') queue.push(queue.shift());
    return queue;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shardsCollected = 0;
    state.wave = 0;
    state.waveState = 'banner';
    state.waveTimer = 1.8;
    state.spawnQueue = buildWaveQueue(0);
    state.spawnTimer = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.shake = 0;
    state.hitStop = 0;
    state.flash = 0;
    state.lastPickup = '';
    for (const list of [state.enemies, state.bullets, state.particles, state.pickups, state.texts]) {
      for (const item of list) item.active = false;
    }
    resetPlayer();
  }

  function spawnPoint() {
    // Enter from an edge at least a fair run from the player.
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random.next() * 4);
      const x = side === 0 ? 30 : side === 1 ? FIELD.width - 30 : random.range(40, FIELD.width - 40);
      const y = side === 2 ? 30 : side === 3 ? FIELD.height - 30 : random.range(40, FIELD.height - 40);
      if (Math.hypot(x - state.player.x, y - state.player.y) > 260) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind, at) {
    const enemy = freeOf(state.enemies);
    if (!enemy) return;
    const spec = ENEMY_KINDS[kind];
    const point = at ?? spawnPoint();
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = point.x;
    enemy.y = point.y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.maxHull = spec.hull + (kind === 'bloom' && state.wave >= 4 ? 1 : 0);
    enemy.hull = enemy.maxHull;
    enemy.radius = spec.radius;
    enemy.phase = random.range(0, TAU);
    enemy.mode = 'seek';
    enemy.modeTimer = random.range(0.4, 1.1);
    enemy.spawnIn = 0.55;
    enemy.flash = 0;
    enemy.angle = 0;
  }

  function burst(x, y, colour, count, speed, size, life, ring = false) {
    for (let i = 0; i < count; i += 1) {
      const particle = freeOf(state.particles);
      if (!particle) return;
      const angle = random.range(0, TAU);
      const velocity = ring ? 0 : random.range(speed * 0.25, speed);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = particle.life = random.range(life * 0.5, life);
      particle.size = ring ? 6 : random.range(size * 0.5, size);
      particle.colour = colour;
      particle.drag = 3.2;
      particle.ring = ring;
    }
  }

  function floatText(x, y, value, colour) {
    const text = freeOf(state.texts);
    if (!text) return;
    text.active = true;
    text.x = x;
    text.y = y;
    text.life = 0.9;
    text.value = value;
    text.colour = colour;
  }

  function dropPickup(x, y, kind) {
    const pickup = freeOf(state.pickups);
    if (!pickup) return;
    pickup.active = true;
    pickup.kind = kind;
    pickup.x = x;
    pickup.y = y;
    pickup.vx = random.range(-40, 40);
    pickup.vy = random.range(-40, 40);
    pickup.life = PICKUPS.life;
    pickup.phase = random.range(0, TAU);
  }

  function addScore(base, x, y) {
    const gained = base * state.multiplier;
    state.score += gained;
    floatText(x, y - 14, `+${gained}`, '#ffe9a8');
  }

  function killEnemy(enemy, events) {
    const spec = ENEMY_KINDS[enemy.kind];
    enemy.active = false;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.killsPerTier));
    addScore(spec.points, enemy.x, enemy.y);
    burst(enemy.x, enemy.y, enemy.kind === 'mote' ? '#8f7bff' : enemy.kind === 'wisp' ? '#ff5d8f' : '#c94fd6', enemy.kind === 'bloom' ? 26 : 14, 260, 4, 0.55);
    burst(enemy.x, enemy.y, '#ffe9a8', 5, 150, 3, 0.4);
    state.shake = Math.min(9, state.shake + (enemy.kind === 'bloom' ? 5 : 2));
    if (enemy.kind === 'bloom') {
      for (let i = 0; i < ENEMY_KINDS.bloom.children; i += 1) {
        spawnEnemy('mote', { x: enemy.x + random.range(-26, 26), y: enemy.y + random.range(-26, 26) });
        const child = state.enemies.find((e) => e.active && e.spawnIn > 0.4 && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 40);
        if (child) child.spawnIn = 0.15;
      }
      dropPickup(enemy.x, enemy.y, PICKUP_SHARD);
    } else if (random.chance(PICKUPS.healChance) && state.player.hull < PLAYER.hull * 0.75) {
      dropPickup(enemy.x, enemy.y, PICKUP_HEAL);
    } else if (random.chance(PICKUPS.surgeChance)) {
      dropPickup(enemy.x, enemy.y, PICKUP_SURGE);
    } else if (random.chance(PICKUPS.shardChance)) {
      dropPickup(enemy.x, enemy.y, PICKUP_SHARD);
    }
    return events | EVENT_KILL;
  }

  function hurtPlayer(damage, fromX, fromY) {
    const player = state.player;
    if (player.invulnerable > 0 || player.dead) return 0;
    player.hull -= damage;
    player.invulnerable = PLAYER.hurtInvulnerable;
    state.flash = 0.55;
    state.shake = Math.min(14, state.shake + 7);
    state.hitStop = 0.045;
    const away = Math.atan2(player.y - fromY, player.x - fromX);
    player.vx += Math.cos(away) * 320;
    player.vy += Math.sin(away) * 320;
    burst(player.x, player.y, '#ff6b6b', 14, 240, 4, 0.45);
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    if (player.hull <= 0) {
      player.hull = 0;
      player.dead = true;
      burst(player.x, player.y, '#ffb347', 42, 340, 5, 0.9);
      burst(player.x, player.y, '#ff7847', 1, 0, 3, 0.7, true);
      state.shake = 16;
      return EVENT_OVER;
    }
    return EVENT_HURT;
  }

  function stepPlayer(dt, input, events) {
    const player = state.player;
    if (player.dead) return events;
    player.fireTimer -= dt;
    player.dashCooldown -= dt;
    player.invulnerable -= dt;
    player.surgeTimer -= dt;

    const move = input.move;
    if (input.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      const dirX = move.x !== 0 || move.y !== 0 ? move.x : Math.cos(player.angle);
      const dirY = move.x !== 0 || move.y !== 0 ? move.y : Math.sin(player.angle);
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      player.dashDirX = dirX;
      player.dashDirY = dirY;
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
      burst(player.x, player.y, '#5ad2ff', 10, 120, 3, 0.3);
      events |= EVENT_DASH;
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashDirX * PLAYER.dashSpeed;
      player.vy = player.dashDirY * PLAYER.dashSpeed;
    } else {
      player.vx += move.x * PLAYER.acceleration * dt;
      player.vy += move.y * PLAYER.acceleration * dt;
      const damp = Math.max(0, 1 - PLAYER.friction * dt);
      if (move.x === 0) player.vx *= damp;
      if (move.y === 0) player.vy *= damp;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > PLAYER.speed) {
        player.vx = (player.vx / speed) * PLAYER.speed;
        player.vy = (player.vy / speed) * PLAYER.speed;
      }
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    player.angle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);

    // Engine trail: a soft ember wake while moving.
    player.trailTimer -= dt;
    const moving = Math.hypot(player.vx, player.vy) > 40;
    if (moving && player.trailTimer <= 0) {
      player.trailTimer = 0.03;
      const particle = freeOf(state.particles);
      if (particle) {
        particle.active = true;
        particle.x = player.x - Math.cos(player.angle) * 12;
        particle.y = player.y - Math.sin(player.angle) * 12;
        particle.vx = -player.vx * 0.15 + random.range(-16, 16);
        particle.vy = -player.vy * 0.15 + random.range(-16, 16);
        particle.maxLife = particle.life = 0.34;
        particle.size = random.range(2, 4.5);
        particle.colour = player.dashTimer > 0 ? '#5ad2ff' : '#ff9a47';
        particle.drag = 2;
        particle.ring = false;
      }
    }

    if (input.firing && player.fireTimer <= 0) {
      const bullet = freeOf(state.bullets);
      if (bullet) {
        const interval = player.surgeTimer > 0 ? PLAYER.surgeFireInterval : PLAYER.fireInterval;
        player.fireTimer = interval;
        const spread = random.range(-0.035, 0.035);
        const angle = player.angle + spread;
        bullet.active = true;
        bullet.x = player.x + Math.cos(player.angle) * 18;
        bullet.y = player.y + Math.sin(player.angle) * 18;
        bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
        bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
        bullet.life = PLAYER.bulletLife;
        state.shotsFired += 1;
        player.vx -= Math.cos(player.angle) * 14;
        player.vy -= Math.sin(player.angle) * 14;
        events |= EVENT_SHOOT;
      }
    }
    return events;
  }

  function stepEnemies(dt, events) {
    const player = state.player;
    const speedScale = 1 + state.wave * WAVE_SCALING.speedPerWave;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      enemy.flash = Math.max(0, enemy.flash - dt * 6);
      if (enemy.spawnIn > 0) {
        enemy.spawnIn -= dt;
        continue;
      }
      const spec = ENEMY_KINDS[enemy.kind];
      const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      enemy.phase += dt * 3;
      if (enemy.kind === 'mote') {
        const wobble = Math.sin(enemy.phase * spec.wobble) * 0.45;
        const angle = toPlayer + wobble;
        enemy.vx += Math.cos(angle) * spec.speed * spec.turn * dt * speedScale;
        enemy.vy += Math.sin(angle) * spec.speed * spec.turn * dt * speedScale;
        const speed = Math.hypot(enemy.vx, enemy.vy);
        const cap = spec.speed * speedScale;
        if (speed > cap) { enemy.vx = (enemy.vx / speed) * cap; enemy.vy = (enemy.vy / speed) * cap; }
        enemy.angle = Math.atan2(enemy.vy, enemy.vx);
      } else if (enemy.kind === 'bloom') {
        enemy.vx += Math.cos(toPlayer) * spec.speed * spec.turn * dt;
        enemy.vy += Math.sin(toPlayer) * spec.speed * spec.turn * dt;
        const speed = Math.hypot(enemy.vx, enemy.vy);
        const cap = spec.speed * speedScale;
        if (speed > cap) { enemy.vx = (enemy.vx / speed) * cap; enemy.vy = (enemy.vy / speed) * cap; }
        enemy.angle += dt * 0.7;
      } else if (enemy.kind === 'wisp') {
        enemy.modeTimer -= dt;
        const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (enemy.mode === 'seek') {
          const dir = distance > spec.keepDistance ? toPlayer : toPlayer + Math.PI;
          enemy.vx += Math.cos(dir) * spec.speed * 3 * dt;
          enemy.vy += Math.sin(dir) * spec.speed * 3 * dt;
          const speed = Math.hypot(enemy.vx, enemy.vy);
          if (speed > spec.speed) { enemy.vx = (enemy.vx / speed) * spec.speed; enemy.vy = (enemy.vy / speed) * spec.speed; }
          enemy.angle = toPlayer;
          if (enemy.modeTimer <= 0 && distance < 340 && !player.dead) {
            enemy.mode = 'telegraph';
            enemy.modeTimer = spec.telegraph;
          }
        } else if (enemy.mode === 'telegraph') {
          enemy.vx *= 0.86;
          enemy.vy *= 0.86;
          enemy.angle = toPlayer;
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'charge';
            enemy.modeTimer = spec.chargeTime;
            enemy.vx = Math.cos(enemy.angle) * spec.chargeSpeed * (1 + state.wave * 0.03);
            enemy.vy = Math.sin(enemy.angle) * spec.chargeSpeed * (1 + state.wave * 0.03);
          }
        } else if (enemy.mode === 'charge') {
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'rest';
            enemy.modeTimer = spec.restTime;
          }
        } else {
          enemy.vx *= 0.9;
          enemy.vy *= 0.9;
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'seek';
            enemy.modeTimer = random.range(0.5, 1.2);
          }
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.min(FIELD.width - enemy.radius, Math.max(enemy.radius, enemy.x));
      enemy.y = Math.min(FIELD.height - enemy.radius, Math.max(enemy.radius, enemy.y));

      if (!player.dead && enemy.spawnIn <= 0) {
        const reach = enemy.radius + PLAYER.radius - 2;
        if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < reach) {
          const hurt = hurtPlayer(spec.damage, enemy.x, enemy.y);
          if (hurt) {
            events |= hurt;
            if (enemy.kind !== 'bloom') enemy.active = false;
            else { enemy.vx = -enemy.vx * 0.6; enemy.vy = -enemy.vy * 0.6; }
          }
        }
      }
    }
    return events;
  }

  function stepBullets(dt, events) {
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      for (const enemy of state.enemies) {
        if (!enemy.active || enemy.spawnIn > 0) continue;
        const reach = enemy.radius + PLAYER.bulletRadius;
        if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < reach) {
          bullet.active = false;
          enemy.hull -= 1;
          enemy.flash = 1;
          enemy.vx += bullet.vx * 0.12;
          enemy.vy += bullet.vy * 0.12;
          burst(bullet.x, bullet.y, '#ffe9a8', 3, 130, 2.5, 0.25);
          events |= EVENT_HIT_ENEMY;
          if (enemy.hull <= 0) events = killEnemy(enemy, events);
          break;
        }
      }
    }
    return events;
  }

  function stepPickups(dt, events) {
    const player = state.player;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      pickup.life -= dt;
      pickup.phase += dt * 4;
      if (pickup.life <= 0) { pickup.active = false; continue; }
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const distance = Math.hypot(dx, dy);
      if (!player.dead && distance < PICKUPS.magnetRange) {
        pickup.vx += (dx / (distance || 1)) * PICKUPS.magnetSpeed * 4 * dt;
        pickup.vy += (dy / (distance || 1)) * PICKUPS.magnetSpeed * 4 * dt;
      } else {
        pickup.vx *= 0.94;
        pickup.vy *= 0.94;
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      if (!player.dead && distance < PLAYER.radius + PICKUPS.radius + 4) {
        pickup.active = false;
        state.lastPickup = pickup.kind;
        if (pickup.kind === PICKUP_SHARD) {
          state.shardsCollected += 1;
          state.score += PICKUPS.shardPoints * state.multiplier;
          floatText(pickup.x, pickup.y - 12, `+${PICKUPS.shardPoints * state.multiplier}`, '#ffc857');
        } else if (pickup.kind === PICKUP_HEAL) {
          player.hull = Math.min(PLAYER.hull, player.hull + PICKUPS.healAmount);
          floatText(pickup.x, pickup.y - 12, `+${PICKUPS.healAmount} HULL`, '#6dffa8');
        } else if (pickup.kind === PICKUP_SURGE) {
          player.surgeTimer = PICKUPS.surgeTime;
          floatText(pickup.x, pickup.y - 12, 'SURGE!', '#5ad2ff');
        }
        burst(pickup.x, pickup.y, pickup.kind === PICKUP_SHARD ? '#ffc857' : pickup.kind === PICKUP_HEAL ? '#6dffa8' : '#5ad2ff', 8, 140, 3, 0.35);
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (const particle of state.particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) { particle.active = false; continue; }
      const damp = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= damp;
      particle.vy *= damp;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.ring) particle.size += 190 * dt;
    }
    for (const text of state.texts) {
      if (!text.active) continue;
      text.life -= dt;
      text.y -= 44 * dt;
      if (text.life <= 0) text.active = false;
    }
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 1.8);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }
  }

  function stepWaves(dt, events) {
    if (state.waveState === 'banner') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveState = 'active';
        events |= EVENT_WAVE;
      }
      return events;
    }
    if (state.waveState === 'cleared') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.wave += 1;
        state.spawnQueue = buildWaveQueue(state.wave);
        state.waveState = 'banner';
        state.waveTimer = 1.6;
      }
      return events;
    }
    // active
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      const interval = Math.max(0.3, WAVE_SCALING.spawnInterval - state.wave * WAVE_SCALING.spawnPerWave);
      if (state.spawnTimer <= 0) {
        state.spawnTimer = interval;
        spawnEnemy(state.spawnQueue.shift());
      }
    } else if (!state.enemies.some((enemy) => enemy.active)) {
      if (state.wave >= WAVES.length - 1) {
        state.waveState = 'won';
        events |= EVENT_WIN;
      } else {
        state.waveState = 'cleared';
        state.waveTimer = 2.2;
        state.score += 150 * (state.wave + 1);
        floatText(FIELD.width / 2, FIELD.height / 2 - 60, `WAVE BONUS +${150 * (state.wave + 1)}`, '#ffe9a8');
      }
    }
    return events;
  }

  reset();

  return {
    state,
    reset,
    /**
     * Advance one fixed step. `input` is { move:{x,y}, aim:{x,y}, firing, dash }.
     * With `attract` true the world idles for the title screen: husks drift, the
     * skiff holds the centre and nothing can be hurt.
     */
    step(dt, input, attract = false) {
      if (state.hitStop > 0 && !attract) {
        state.hitStop -= dt;
        stepFx(dt * 0.25);
        return 0;
      }
      state.time += dt;
      let events = 0;
      if (attract) {
        if (state.spawnQueue.length > 0 && random.chance(0.02)) spawnEnemy(state.spawnQueue.shift());
        if (!state.enemies.some((e) => e.active)) {
          state.spawnQueue = buildWaveQueue(1);
        }
        state.player.invulnerable = 5;
        events = stepEnemies(dt, events);
        // Attract husks never hurt: the skiff is a ghost on the title screen.
        state.player.hull = PLAYER.hull;
        state.player.dead = false;
        stepFx(dt);
        return events;
      }
      events = stepWaves(dt, events);
      events = stepPlayer(dt, input, events);
      events = stepEnemies(dt, events);
      events = stepBullets(dt, events);
      events = stepPickups(dt, events);
      stepFx(dt);
      if (state.player.dead) events |= EVENT_OVER;
      return events;
    },
    /** Directly place the run in a late state; used by the screenshot scenes. */
    debugSet(patch) {
      Object.assign(state, patch);
    },
  };
}
