import { PASSIVES, STATUSES, ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';

// Read a param from an effect instance, falling back to the schema default.
export function effParam(eff, paramKey) {
  if (eff[paramKey] !== undefined) return eff[paramKey];
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema && schema.params && schema.params[paramKey] ? schema.params[paramKey].default : undefined;
}

// All effects across all phases (used by display helpers / classification).
export function allEffects(ability) {
  return (ability.phases || []).flat();
}

// All effects in a specific phase.
function phaseEffects(ability, phaseIdx) {
  const phases = ability.phases || [];
  return phases[phaseIdx] || [];
}

// Schema-declared default timing for an effect type. Damage modifiers don't have a timing.
function effectTiming(eff) {
  if (eff.timing) return eff.timing;
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema?.defaultTiming || null;
}

function isModifier(eff) {
  return ADDITIONAL_EFFECTS[eff.type]?.modifier === true;
}

// Apply the cursed-on-swap penalty if the swapping-out fighter has cursed status.
export function applyCursedOnSwap(f, side) {
  if (!f || !f.statuses || !f.statuses.cursed) return 0;
  const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.cursed.percentOnSwap));
  f.hp = Math.max(0, f.hp - dmg);
  spawnFloat(side, String(dmg), 'crit');
  pushLog(`${displayName(f.creature)} suffers ${dmg} from the curse on swap-out!`, 'eff');
  return dmg;
}

// Post-hit passive resolution (called per landed hit).
export function processPostHit(side, oside, attacker, defender, ability, result) {
  applyPostHitPassives(side, oside, attacker, defender, result, {
    applyHeal, applyStatus, spawnFloat, pushLog, displayName,
  });
}

// Resolve a target key from the attacker's perspective into a list of fighters.
export function resolveTargets(targetKey, side, attacker, defender) {
  const ownBench   = side === 'player' ? state.bf  : state.ebf;
  const enemyBench = side === 'player' ? state.ebf : state.bf;
  if (targetKey === 'self')        return attacker.hp > 0 ? [attacker] : [];
  if (targetKey === 'bench')       return ownBench && ownBench.hp > 0 ? [ownBench] : [];
  if (targetKey === 'enemy')       return defender && defender.hp > 0 ? [defender] : [];
  if (targetKey === 'enemy_bench') return enemyBench && enemyBench.hp > 0 ? [enemyBench] : [];
  return [];
}

// Returns status apply opts, overriding defaults for passives that modify a specific status.
function statusOptsFor(attacker, statusName) {
  if (statusName === 'burn' && hasPassive(attacker, 'pyromancer')) {
    const p = PASSIVES.pyromancer;
    return { turns: p.burnTurns, pct: p.burnPct };
  }
  return {};
}

// ─── Per-effect handlers (timed) ────────────────────────────────────────────
// Each handler receives a context: { side, oside, attacker, defender, lastDmg, helpers }.
// `lastDmg` is the most-recent hit's damage (0 if not in eachHit context).
// `helpers` carries cross-module callbacks (performSelfSwap) to avoid circular imports.

function handleEffect(eff, ctx) {
  const { side, oside, attacker, defender, lastDmg, helpers } = ctx;
  switch (eff.type) {
    case 'apply_status': {
      const status   = effParam(eff, 'status');
      const targets  = effParam(eff, 'targets') || ['enemy'];
      const turnsOv  = effParam(eff, 'turnsOverride');
      const pctOv    = effParam(eff, 'percentOverride');
      const opts     = { ...statusOptsFor(attacker, status) };
      if (turnsOv && turnsOv > 0) opts.turns = turnsOv;
      if (pctOv && pctOv > 0)     opts.pct   = pctOv;
      const def = STATUSES[status];
      const log = def ? def.name : status;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) applyStatus(f, status, opts);
      const names = fighters.map(f => displayName(f.creature));
      if (names.length === 1) pushLog(`${names[0]} is afflicted with ${log}.`);
      else if (names.length > 1) pushLog(`${names.join(' and ')} are afflicted with ${log}!`, 'eff');
      return;
    }
    case 'buff': {
      const targets = effParam(eff, 'targets') || ['self'];
      const sm = eff.statMult || {};
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        for (const [k, v] of Object.entries(sm)) {
          if (typeof v === 'number' && v !== 0) f.statMods[k] = (f.statMods[k] || 0) + v;
        }
      }
      const parts = Object.entries(sm)
        .filter(([, v]) => typeof v === 'number' && v !== 0)
        .map(([k, v]) => `${k.toUpperCase()} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
      if (fighters.length && parts.length) {
        const names = fighters.map(f => displayName(f.creature)).join(' and ');
        pushLog(`${names}: ${parts.join(', ')}.`, 'eff');
      }
      return;
    }
    case 'heal_over_time': {
      const percent = effParam(eff, 'percent');
      const turns   = effParam(eff, 'turns');
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        const perTurn = Math.max(1, Math.round(f.creature.maxHp * percent));
        f.healing = { perTurn, turnsLeft: turns };
        pushLog(`${displayName(f.creature)} begins healing (+${perTurn}/turn for ${turns}).`);
      }
      return;
    }
    case 'bracing': {
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) f.bracingThisTurn = true;
      if (fighters.length) pushLog(`${fighters.map(f => displayName(f.creature)).join(' and ')} brace.`);
      return;
    }
    case 'cleanse': {
      const targets    = effParam(eff, 'targets') || ['self'];
      const doStatuses = effParam(eff, 'cleanseStatuses');
      const doBuffs    = effParam(eff, 'cleanseBuffs');
      const doDebuffs  = effParam(eff, 'cleanseDebuffs');
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        if (doStatuses) cleanseStatuses(f);
        if (doBuffs || doDebuffs) {
          for (const k of ['atk', 'def', 'spd']) {
            if (doBuffs   && f.statMods[k] > 0) f.statMods[k] = 0;
            if (doDebuffs && f.statMods[k] < 0) f.statMods[k] = 0;
          }
        }
        pushLog(`${displayName(f.creature)} is cleansed.`);
      }
      return;
    }
    case 'lifesteal': {
      const pct = effParam(eff, 'percentOfDamage') || 0;
      const healed = applyHeal(attacker, Math.round((lastDmg || 0) * pct));
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(attacker.creature)} drains ${healed}.`);
      }
      return;
    }
    case 'hp_cost': {
      const pct = effParam(eff, 'percent') || 0;
      const cost = Math.round(attacker.creature.maxHp * pct);
      attacker.hp = Math.max(1, attacker.hp - cost);
      spawnFloat(side, String(cost), 'dmg');
      return;
    }
    case 'swap': {
      const targets = effParam(eff, 'targets') || ['self'];
      if (targets.includes('enemy')) doEnemySwap(side, oside, defender);
      if (targets.includes('self') && attacker.hp > 0) {
        helpers.performSelfSwap(side, attacker, eff);
      }
      return;
    }
    // Damage modifiers and 'damage' have no timed handler — damage runs in the phase
    // runner; modifiers are read by calculateDamage.
  }
}

function doEnemySwap(side, oside, defender) {
  const oppBench = side === 'player' ? state.ebf : state.bf;
  if (!oppBench || oppBench.hp <= 0) {
    pushLog(`${displayName(defender.creature)} has nowhere to swap.`, 'eff');
    return;
  }
  applyCursedOnSwap(defender, oside);
  pushLog(`${displayName(defender.creature)} is yanked from the field!`, 'eff');
  if (side === 'player') {
    const out = state.ef;
    state.ef = state.ebf;
    state.ebf = out;
    state.enemyActiveIdx = 1 - state.enemyActiveIdx;
    state.enemy = state.enemyParty[state.enemyActiveIdx];
    if (state.ef) state.ef.queuedAbility = null;
  } else {
    const out = state.pf;
    state.pf = state.bf;
    state.bf = out;
    state.activeIdx = 1 - state.activeIdx;
    if (state.pf) state.pf.queuedAbility = null;
  }
}

// Run all timed effects in a phase that match a given timing band. Returns nothing.
export function runTimedEffects(timing, phase, ctx) {
  for (const eff of phase) {
    if (isModifier(eff) || eff.type === 'damage') continue;
    if (effectTiming(eff) !== timing) continue;
    handleEffect(eff, ctx);
  }
}

// Run effects with timing=eachHit in a phase, called once per landed damage hit.
export function runEachHitEffects(phase, ctx) {
  for (const eff of phase) {
    if (isModifier(eff) || eff.type === 'damage') continue;
    if (effectTiming(eff) !== 'eachHit') continue;
    handleEffect(eff, ctx);
  }
}

// Modifier accessors used by damage.js / passives.js.
export function findModifier(phase, type) {
  return phase.find(e => e.type === type) || null;
}
