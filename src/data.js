// Loads game data from data/*.json. Call await loadData() once at startup.
// All other modules import from this file (named exports populated at load time).

export let TYPES = [];
export let TYPE_CHART = {};
export let TYPE_PALETTE = {};
export let PASSIVES = {};
export let ABILITIES = {};
export let STATUSES = {};
export let ADDITIONAL_EFFECTS = {};
export let TEMPLATES = [];
export let ALL_ENCOUNTER_SPECIES = [];
export const GLOBALS = { growthThresholds: [] };
export const PASSIVE_SCHEMA = { triggers: {}, conditions: {}, effects: {} };

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

export async function loadData() {
  const [types, passives, abilities, statuses, addEffects, templates, globals, passiveSchema] = await Promise.all([
    fetchJson('data/types.json'),
    fetchJson('data/passives.json'),
    fetchJson('data/abilities.json'),
    fetchJson('data/statuseffects.json'),
    fetchJson('data/additionaleffects.json'),
    fetchJson('data/templates.json'),
    fetchJson('data/globals.json'),
    fetchJson('data/passivetriggers.json'),
  ]);
  TYPES = types.TYPES;
  Object.assign(TYPE_CHART, types.TYPE_CHART);
  Object.assign(TYPE_PALETTE, types.TYPE_PALETTE);
  Object.assign(PASSIVES, passives);
  Object.assign(ABILITIES, abilities);
  Object.assign(STATUSES, statuses);
  Object.assign(ADDITIONAL_EFFECTS, addEffects);
  TEMPLATES.length = 0;
  TEMPLATES.push(...templates);
  ALL_ENCOUNTER_SPECIES.length = 0;
  ALL_ENCOUNTER_SPECIES.push(...TEMPLATES.filter(t => !t.starter).map(t => t.species));
  GLOBALS.growthThresholds = globals.growthThresholds || [];
  Object.assign(PASSIVE_SCHEMA.triggers,   passiveSchema.triggers   || {});
  Object.assign(PASSIVE_SCHEMA.conditions, passiveSchema.conditions || {});
  Object.assign(PASSIVE_SCHEMA.effects,    passiveSchema.effects    || {});
}
