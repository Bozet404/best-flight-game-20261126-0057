// Selat Jakarta Run — hand-in program for the make.fun best flight game bounty.
//
// main.ts copies the static game (game/) and its screenshots (screenshots/)
// from this repository into the output directory and writes dossier.json
// there with buildDossier from vendor/makefun-game.ts. It runs on Node 22
// with no dependencies beyond the standard library, and it writes exactly
// the same bytes every time it runs on the same commit.

import { buildDossier } from "./vendor/makefun-game.ts";
import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The repository root is the directory that holds this file. The grader
// mounts it read-only as /bot; the output directory is /output there, and
// MAKEFUN_OUTPUT_DIR stands in for it when running locally.
const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Create the output directory only when it is missing. The grader mounts
// it, so this program must never delete it or anything inside it.
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// Hand in the game and its screenshots exactly as they are in the repo.
cpSync(join(repoRoot, "game"), join(outDir, "game"), { recursive: true });
cpSync(join(repoRoot, "screenshots"), join(outDir, "screenshots"), {
  recursive: true,
});

// Build the dossier the judge reads: the game's source (capped at 160 KiB
// of text), the screenshots (at most 8, at most 4 MiB each), and the game
// tree limits the bounty publishes for its hosted site.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 8, max_bytes: 4 * 1024 * 1024 },
  game_max_files: 1000,
  game_max_bytes: 60 * 1024 * 1024,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, "dossier.json"), dossier);

// The hand-in is three things: the game, the screenshots and the dossier.
// Confirm all three landed before reporting success, so a half-written
// output directory never passes as a hand-in.
const handedIn = [
  join(outDir, "game", "index.html"),
  join(outDir, "screenshots", "1-menu.jpg"),
  join(outDir, "dossier.json"),
];
for (const file of handedIn) {
  if (!existsSync(file)) throw new Error(`hand-in incomplete: ${file} is missing`);
}

console.log(`Selat Jakarta Run handed in to ${outDir}`);
console.log(`dossier.json: ${dossier.length} bytes`);
