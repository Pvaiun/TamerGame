import { PASSIVES, STATUSES, ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';

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
  for (const eff of (ability.additionalEffects || [])) {
    handleAdditionalEffect(eff, side, oside, attacker, defender, result);
  }
}

function handleAdditionalEffect(eff, side, oside, attacker, defender, result) {
  const cfg = ADDITIONAL_EFFECTS[eff] || {};
  switch (eff) {
    case 'burn_stacking': {
      const cur = defender.statuses.burn ? defender.statuses.burn.turns : 0;
      applyStatus(defender, 'burn', { turns: Math.max(cfg.minTurns, cur + cfg.extendTurns), pct: cfg.burnPct });
      pushLog(`${displayName(defender.creature)}'s burn smolders deeper.`);
      break;
    }
    case 'cursed_synergy':
      // Bonus damage if target is already cursed — handled in damage.js; no status apply here.
      break;
    case 'soaking_double':
      applyStatus(defender, 'soaking', { stacks: cfg.stacks, turns: cfg.turns });
      pushLog(`${displayName(defender.creature)} is heavily soaked.`);
      break;
    case 'execute_scale':
      // Damage scaling by missing HP is handled upstream in damage calculation.
      break;
    case 'lifesteal_strong':
    case 'lifesteal_full': {
      const healed = applyHeal(attacker, Math.round(result.dmg * (cfg.lifestealPct ?? 1)));
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(attacker.creature)} drains ${healed}.`);
      }
      break;
    }
    case 'cleanse_self':
      cleanseStatuses(attacker);
      attacker.statMods = { atk: 0, def: 0, spd: 0 };
      pushLog(`${displayName(attacker.creature)} is cleansed.`);
      break;
    case 'force_swap': {
      const oppBench = side === 'player' ? state.ebf : state.bf;
      if (!oppBench || oppBench.hp <= 0) {
        pushLog(`${displayName(defender.creature)} has nowhere to swap.`, 'eff');
        break;
      }
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
      break;
    }
    case 'thorn_soaking':
      attacker.thornSoaking = true;
      pushLog(`${displayName(attacker.creature)} cloaks itself in vapor.`);
      break;
    case 'pierce':
      // Handled upstream in damage calculation.
      break;
  }
}
