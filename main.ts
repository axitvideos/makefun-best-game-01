// Emberwake — Hold the Dawn Line: entrypoint for the best-game-01 bounty (Node 22,
// standard library only). The game itself is the game/ folder beside this file: plain
// static files (index.html plus ES modules) that a desktop browser loads fully offline.
// This program hands the entry in: it stages game/ and screenshots/ into the output
// directory and writes dossier.json there with the vendored make.fun library.
//
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the staged game with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Inventory of what is about to be handed in, so a broken staging fails loudly here
// instead of at the judge: the game entry file must exist, and the screenshots folder
// must hold the 3 or 4 shots the rules ask for (the first by name is the cover).
function inventory(dir, label) {
  const names = readdirSync(dir).sort();
  let bytes = 0;
  for (const name of names) bytes += statSync(join(dir, name)).size;
  console.log(`${label}: ${names.length} file(s), ${bytes} byte(s) — ${names.join(', ')}`);
  return names;
}

const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
inventory(gameDir, 'game source');

const shotsDir = join(here, 'screenshots');
const shots = existsSync(shotsDir) ? inventory(shotsDir, 'screenshots') : [];
if (shots.length < 3 || shots.length > 4) throw new Error(`need 3 or 4 screenshots, found ${shots.length}`);

// Stage the entry exactly as the grader expects it: game/ and screenshots/ under the
// output directory, then the dossier summarising them.
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all, or a path under
// game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`dossier written to ${join(out, 'dossier.json')}`);
