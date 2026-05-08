// Custom Node.js loader that stubs out browser-only modules so the combat
// engine can be imported and exercised in Node without a browser.
// Usage: node --experimental-loader ./tools/test_loader.mjs tools/combat_test.mjs

import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(ROOT, 'data');

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(dataDir, name), 'utf8'));
}

// Modules we intercept and replace with stubs or real data.
const STUBS = {
  'src/data.js': () => {
    const passives        = loadJson('passives.json');
    const additionalEffects = loadJson('additionaleffects.json');
    const types           = loadJson('types.json');
    const statuses        = loadJson('statuseffects.json');
    const abilities       = loadJson('abilities.json');
    const globals         = loadJson('globals.json');
    const passiveSchema   = loadJson('passivetriggers.json');
    return `
export const TYPES = ${JSON.stringify(types.TYPES)};
export const TYPE_CHART = ${JSON.stringify(types.TYPE_CHART)};
export const TYPE_PALETTE = ${JSON.stringify(types.TYPE_PALETTE)};
export const PASSIVES = ${JSON.stringify(passives)};
export const ABILITIES = ${JSON.stringify(abilities)};
export const STATUSES = ${JSON.stringify(statuses)};
export const ADDITIONAL_EFFECTS = ${JSON.stringify(additionalEffects)};
export const TEMPLATES = [];
export const ALL_ENCOUNTER_SPECIES = [];
export const GLOBALS = ${JSON.stringify({ growthThresholds: globals.growthThresholds })};
export const PASSIVE_SCHEMA = ${JSON.stringify(passiveSchema)};
export async function loadData() {}
`;
  },
  'src/rng.js': () => `
export function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
export function randi(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function pickN(arr, n) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
`,
  'src/state.js': () => `
export const state = {};
export function pushLog() {}
export function resetGame() {}
export function nextCreatureId() { return Math.random(); }
export const TOTAL_WAVES = 10;
export const BREED_WAVES = new Set([3,6,9]);
export const MAX_LEVEL = 50;
`,
  'src/audio.js':         () => `export function sfx() {}`,
  'src/art.js':           () => `export function drawCreature() {} export function blendPalette() {}`,
  'src/ui/render.js':     () => `export function render() {}`,
  'src/ui/animations.js': () => `export function spawnFloat() {} export function spawnCallout() {} export function shakeStage() {} export function playLunge() {} export function playRecoil() {}`,
  'src/ui/dom.js':        () => `export function el() {} export function app() {} export function attachLongPress() {}`,
  'src/ui/battle.js':     () => `export function renderBattle() {}`,
  'src/ui/screens.js':    () => `export function renderStart() {}`,
  'src/ui/cards.js':      () => `export function renderCard() {}`,
};

// Resolve: normalise relative imports from inside src/ to a canonical key.
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const filePath = fileURLToPath(resolved.url);
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (STUBS[rel]) {
    return { url: `stub:${rel}`, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('stub:')) {
    const key = url.slice(5);
    const src = STUBS[key]();
    return { format: 'module', source: src, shortCircuit: true };
  }
  return nextLoad(url, context);
}
