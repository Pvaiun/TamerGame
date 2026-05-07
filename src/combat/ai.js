import { TYPE_CHART, ABILITIES } from '../data.js';
import { state } from '../state.js';

// Returns an ability key from the active fighter's pool, or '_swap' meaning
// "swap to bench this turn" (caller dispatches a swap, not a resolveAction).
export function aiChoose(ef, pf) {
  const abilities = ef.creature.abilities;
  const hpFrac = ef.hp / ef.creature.maxHp;
  const lowHp = hpFrac < 0.3;
  if (state.ebf && state.ebf.hp > 0) {
    let swapWeight = 0;
    const benchFrac = state.ebf.hp / state.ebf.creature.maxHp;
    if (hpFrac < 0.25 && benchFrac > hpFrac + 0.30) swapWeight += 0.55;
    if (ef.statuses && ef.statuses.cursed && hpFrac < 0.5 && benchFrac > 0.5) swapWeight += 0.35;
    if (ef.statuses && ef.statuses.soaking && benchFrac > 0.6) swapWeight += 0.30;
    const pType = pf.creature.type;
    let activeBest = 1, benchBest = 1;
    for (const k of ef.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element) activeBest = Math.max(activeBest, TYPE_CHART[a.element][pType] || 1);
    }
    for (const k of state.ebf.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element) benchBest = Math.max(benchBest, TYPE_CHART[a.element][pType] || 1);
    }
    if (benchBest > activeBest && benchFrac > 0.6) swapWeight += 0.25;
    let playerBest = 1;
    for (const k of pf.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element) playerBest = Math.max(playerBest, TYPE_CHART[a.element][ef.creature.type] || 1);
    }
    let playerVsBench = 1;
    for (const k of pf.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element) playerVsBench = Math.max(playerVsBench, TYPE_CHART[a.element][state.ebf.creature.type] || 1);
    }
    if (playerBest > playerVsBench && hpFrac < 0.7) swapWeight += 0.20;
    if (hpFrac < 0.6 && benchFrac > 0.7 && Math.random() < 0.05) swapWeight += 0.15;
    if (Math.random() < swapWeight) return '_swap';
  }
  if (lowHp) {
    if (abilities.includes('mend') && (!ef.healing || ef.healing.turnsLeft <= 1)) return 'mend';
  }
  let best = null, bestScore = -1;
  for (const k of abilities) {
    const a = ABILITIES[k];
    if (a.kind !== 'attack' && a.kind !== 'charge_attack') continue;
    let s = a.power || 1;
    if (a.element) s *= TYPE_CHART[a.element][pf.creature.type] || 1;
    s += Math.random() * 0.3;
    if (s > bestScore) { bestScore = s; best = k; }
  }
  return best || abilities[0];
}
