// Global game state and lifecycle helpers. Most modules import `state` and mutate
// it directly. The renderer reads `state.screen` to dispatch to a screen renderer.

export const TOTAL_WAVES = 10;
export const BREED_WAVES = new Set([3, 6, 9]);
export const MAX_LEVEL = 50;

export const state = {
  screen: 'start',
  wave: 0,
  party: [],
  reserve: [],
  activeIdx: 0,
  enemy: null,
  enemyParty: [],
  enemyActiveIdx: 0,
  pf: null,
  bf: null,
  ef: null,
  ebf: null,
  log: [],
  breedState: null,
  postBattleEvents: null,
  acting: false,
  pCharge: null,
  eCharge: null,
};

export function pushLog(msg, cls = '') {
  state.log.push({ msg, cls });
  if (state.log.length > 30) state.log.shift();
}

export function resetGame() {
  state.wave = 0;
  state.party = [];
  state.reserve = [];
  state.activeIdx = 0;
  state.enemy = null;
  state.enemyParty = [];
  state.enemyActiveIdx = 0;
  state.pf = null; state.bf = null; state.ef = null; state.ebf = null;
  state.pCharge = null; state.eCharge = null;
  state.log = [];
  state.breedState = null;
  state.postBattleEvents = null;
  state.acting = false;
  state.screen = 'start';
}

// Allocates monotonically increasing creature IDs. Used by makeCreature() and
// makeChild() — they share one counter so IDs are unique across both.
let creatureIdCounter = 1;
export function nextCreatureId() { return creatureIdCounter++; }
