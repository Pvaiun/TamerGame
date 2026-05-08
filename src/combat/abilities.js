import { PASSIVES, STATUSES, ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';

// Read a param from an additional-effect instance, falling back to the schema default.
export function effParam(eff, paramKey) {
  if (eff[paramKey] !== undefined) return eff[paramKey];
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema && schema.params && schema.params[paramKey] ? schema.params[paramKey].default : undefined;
}

// Find the first additional effect of a given type on an ability.
export function findEffect(ability, type) {
  return (ability.additionalEffects || []).find(e => e.type === type) || null;
}

// Apply the cursed-on-swap penalty if the swapping-out fighter has cursed status.
// Returns the damage dealt (could be 0 if not cursed). Used by both player and enemy swaps.
export function applyCursedOnSwap(f, side) {
  if (!f || !f.statuses || !f.statuses.cursed) return 0;
  const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.cursed.percentOnSwap));
  f.hp = Math.max(0, f.hp - dmg);
  spawnFloat(side, String(dmg), 'crit');
  pushLog(`${displayName(f.creature)} suffers ${dmg} from the curse on swap-out!`, 'eff');
  return dmg;
}

// Process all post-hit consequences after a damaging hit landed.
// Used by both single-hit and multi-hit attacks so each hit independently rolls effects.
export function processPostHit(side, oside, attacker, defender, ability, result) {
  applyPostHitPassives(side, oside, attacker, defender, result, {
    applyHeal, applyStatus, spawnFloat, pushLog, displayName,
  });
}

// Returns the fighters that correspond to a target key from the attacker's perspective.
function resolveTargets(targetKey, side, attacker, defender) {
  const ownBench   = side === 'player' ? state.bf  : state.ebf;
  const enemyBench = side === 'player' ? state.ebf : state.bf;
  if (targetKey === 'self')        return attacker.hp > 0 ? [attacker] : [];
  if (targetKey === 'bench')       return ownBench && ownBench.hp > 0 ? [ownBench] : [];
  if (targetKey === 'enemy')       return defender.hp > 0 ? [defender] : [];
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

// Resolve statusEffects[] and additionalEffects[] on an ability after a hit lands.
export function resolveAbilityEffect(side, oside, attacker, defender, ability, result) {
  if (defender.hp <= 0) return;

  // ── Status effect applications ──────────────────────────────────────────
  for (const se of (ability.statusEffects || [])) {
    const opts = statusOptsFor(attacker, se.status);
    const def  = STATUSES[se.status];
    const log  = def ? def.name : se.status;
    for (const tk of (se.targets || [])) {
      const fighters = resolveTargets(tk, side, attacker, defender);
      for (const f of fighters) {
        applyStatus(f, se.status, opts);
      }
    }
    // Collect names for log line
    const names = (se.targets || [])
      .flatMap(tk => resolveTargets(tk, side, attacker, defender))
      .map(f => displayName(f.creature));
    if (names.length === 1) {
      pushLog(`${names[0]} is afflicted with ${log}.`);
    } else if (names.length > 1) {
      pushLog(`${names.join(' and ')} are afflicted with ${log}!`, 'eff');
    }
  }

  // ── Additional (non-status) effects ─────────────────────────────────────
  // Note: hp_cost is applied at the start of resolveAction; swap is processed once
  // after the action by processSwapEffects. Both are skipped here.
  for (const eff of (ability.additionalEffects || [])) {
    handleAdditionalEffect(eff, side, oside, attacker, defender, result);
  }
}

function handleAdditionalEffect(eff, side, oside, attacker, defender, result) {
  switch (eff.type) {
    case 'lifesteal': {
      const pct = effParam(eff, 'percentOfDamage');
      const healed = applyHeal(attacker, Math.round(result.dmg * pct));
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(attacker.creature)} drains ${healed}.`);
      }
      break;
    }
    case 'cleanse': {
      const targets = effParam(eff, 'targets') || ['self'];
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
      break;
    }
    // Pure damage modifiers: handled upstream in damage.js / passives.js.
    case 'execute_scale':
    case 'pierce':
    case 'status_synergy':
    // hp_cost is applied at action start in resolveAction.
    case 'hp_cost':
    // swap is processed after the action by processSwapEffects.
    case 'swap':
      break;
  }
}

// Apply hp_cost effects on the user before the ability resolves.
export function processHpCost(side, attacker, ability) {
  for (const eff of (ability.additionalEffects || [])) {
    if (eff.type !== 'hp_cost') continue;
    const pct = effParam(eff, 'percent') || 0;
    const cost = Math.round(attacker.creature.maxHp * pct);
    attacker.hp = Math.max(1, attacker.hp - cost);
    spawnFloat(side, String(cost), 'dmg');
  }
}

// Process swap effects once after an ability resolves. Each swap effect can
// target "self", "enemy", or both. Self-swap uses performSelfSwap (called via
// the injected helper); enemy-swap is force-swap of the defender side.
export function processSwapEffects(side, oside, attacker, defender, ability, helpers) {
  for (const eff of (ability.additionalEffects || [])) {
    if (eff.type !== 'swap') continue;
    const targets = effParam(eff, 'targets') || ['self'];
    if (targets.includes('enemy')) {
      const oppBench = side === 'player' ? state.ebf : state.bf;
      if (!oppBench || oppBench.hp <= 0) {
        pushLog(`${displayName(defender.creature)} has nowhere to swap.`, 'eff');
      } else {
        applyCursedOnSwap(defender, oside);
        pushLog(`${displayName(defender.creature)} is yanked from the field!`, 'eff');
        if (side === 'player') {
          const out = state.ef;
          state.ef = state.ebf;
          state.ebf = out;
          state.enemyActiveIdx = 1 - state.enemyActiveIdx;
          state.enemy = state.enemyParty[state.enemyActiveIdx];
          state.eCharge = null;
        } else {
          const out = state.pf;
          state.pf = state.bf;
          state.bf = out;
          state.activeIdx = 1 - state.activeIdx;
          state.pCharge = null;
        }
      }
    }
    if (targets.includes('self') && attacker.hp > 0) {
      helpers.performSelfSwap(side, attacker, ability);
    }
  }
}
