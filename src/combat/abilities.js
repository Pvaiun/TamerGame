import { state, pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive } from './passives.js';
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
  if (hasPassive(defender, 'adrenal_surge') && defender.hp > 0) {
    if (result.dmg >= defender.creature.maxHp * 0.3) {
      if (!defender.adrenalTurns) {
        defender.statMods.atk += 0.3;
        defender.adrenalAtkDelta = 0.3;
      }
      defender.adrenalTurns = 3;
      pushLog(`${displayName(defender.creature)}'s Adrenal Surge triggers (+30% ATK)!`, 'eff');
    }
  }
  if (hasPassive(attacker, 'soul_drain')) {
    const healed = applyHeal(attacker, Math.round(result.dmg * 0.25));
    if (healed > 0) spawnFloat(side, `+${healed}`, 'heal');
  }
  if (hasPassive(defender, 'riposte') && defender.hp > 0) {
    const back = Math.round(result.dmg * 0.25);
    attacker.hp = Math.max(0, attacker.hp - back);
    spawnFloat(side, String(back), 'dmg');
    pushLog(`${displayName(defender.creature)}'s Riposte deals ${back} back.`);
  }
  if (hasPassive(defender, 'counterstance') && defender.bracingThisTurn && defender.hp > 0) {
    const back = Math.round(result.dmg * 0.5);
    attacker.hp = Math.max(0, attacker.hp - back);
    spawnFloat(side, String(back), 'dmg');
    pushLog(`${displayName(defender.creature)}'s Counterstance reflects ${back}!`, 'eff');
  }
  if (hasPassive(defender, 'aquaveil') && !defender.aquaveilUsed) {
    const halfHp = Math.round(defender.creature.maxHp * 0.5);
    if (defender.hp < halfHp && defender.hp > 0) {
      defender.hp = halfHp;
      defender.aquaveilUsed = true;
      spawnFloat(oside, `+${halfHp}`, 'heal');
      pushLog(`${displayName(defender.creature)}'s Aquaveil triggers!`, 'eff');
    }
  }
  if (hasPassive(attacker, 'frostbite') && defender.hp > 0) {
    if (!hasPassive(defender, 'iron_will')) {
      defender.statMods.spd -= 0.10;
    }
  }
  if (defender.thornSoaking && defender.hp > 0 && attacker.hp > 0) {
    applyStatus(attacker, 'soaking', { stacks: 1, turns: 4 });
  }
}

// Resolve the named ability `effect` (status applications, healing, etc.) — only after a damaging hit lands.
export function resolveAbilityEffect(side, oside, attacker, defender, ability, result) {
  const effect = ability.effect;
  if (!effect || defender.hp <= 0) return;
  switch (effect) {
    case 'burn':
      applyStatus(defender, 'burn', { turns: hasPassive(attacker, 'pyromancer') ? 4 : 4, pct: 0.05 });
      pushLog(`${displayName(defender.creature)} is burning.`);
      break;
    case 'burn_long':
      applyStatus(defender, 'burn', { turns: 6, pct: 0.05 });
      pushLog(`${displayName(defender.creature)} is burning (long).`);
      break;
    case 'burn_stacking': {
      const cur = defender.statuses.burn ? defender.statuses.burn.turns : 0;
      applyStatus(defender, 'burn', { turns: Math.max(4, cur + 2), pct: 0.05 });
      pushLog(`${displayName(defender.creature)}'s burn smolders deeper.`);
      break;
    }
    case 'cursed_synergy':
      applyStatus(defender, 'cursed', { turns: 99, pct: 0.30 });
      pushLog(`${displayName(defender.creature)} is cursed.`);
      break;
    case 'execute_scale':
      break;
    case 'soaking':
      applyStatus(defender, 'soaking', { stacks: 1, turns: 4 });
      pushLog(`${displayName(defender.creature)} is soaked.`);
      break;
    case 'soaking_double':
      applyStatus(defender, 'soaking', { stacks: 2, turns: 4 });
      pushLog(`${displayName(defender.creature)} is heavily soaked.`);
      break;
    case 'cursed':
      applyStatus(defender, 'cursed', { turns: 99, pct: 0.30 });
      pushLog(`${displayName(defender.creature)} is cursed.`);
      break;
    case 'dazed':
      applyStatus(defender, 'dazed', { turns: 2 });
      pushLog(`${displayName(defender.creature)} is dazed.`);
      break;
    case 'dazed_long':
      applyStatus(defender, 'dazed', { turns: 4 });
      pushLog(`${displayName(defender.creature)} is dazed (long).`);
      break;
    case 'cleanse_self':
      cleanseStatuses(attacker);
      attacker.statMods = { atk: 0, def: 0, spd: 0 };
      pushLog(`${displayName(attacker.creature)} is cleansed.`);
      break;
    case 'lifesteal_strong': {
      const healed = applyHeal(attacker, Math.round(result.dmg * 0.5));
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(attacker.creature)} drains ${healed}.`);
      }
      break;
    }
    case 'lifesteal_full': {
      const healed = applyHeal(attacker, result.dmg);
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(attacker.creature)} drains ${healed}.`);
      }
      break;
    }
    case 'bloom_self':
      applyStatus(attacker, 'bloom', { turns: 4, pct: 0.05 });
      pushLog(`${displayName(attacker.creature)} blooms.`);
      break;
    case 'bloom_self_long':
      applyStatus(attacker, 'bloom', { turns: 6, pct: 0.06 });
      pushLog(`${displayName(attacker.creature)} blooms (long).`);
      break;
    case 'wither_combo':
      applyStatus(defender, 'cursed', { turns: 99, pct: 0.30 });
      applyStatus(defender, 'soaking', { stacks: 1, turns: 4 });
      pushLog(`${displayName(defender.creature)} withers.`);
      break;
    case 'burn_both': {
      applyStatus(defender, 'burn', { turns: 4, pct: 0.05 });
      const ownBench = side === 'player' ? state.bf : state.ebf;
      if (ownBench && ownBench.hp > 0) {
        applyStatus(ownBench, 'burn', { turns: 4, pct: 0.05 });
        pushLog(`${displayName(defender.creature)} and ${displayName(ownBench.creature)} are both burning!`, 'eff');
      } else {
        pushLog(`${displayName(defender.creature)} is burning.`);
      }
      break;
    }
    case 'cursed_both': {
      applyStatus(defender, 'cursed', { turns: 99, pct: 0.30 });
      const ownBench = side === 'player' ? state.bf : state.ebf;
      if (ownBench && ownBench.hp > 0) {
        applyStatus(ownBench, 'cursed', { turns: 99, pct: 0.30 });
        pushLog(`${displayName(defender.creature)} and ${displayName(ownBench.creature)} are both cursed!`, 'eff');
      } else {
        pushLog(`${displayName(defender.creature)} is cursed.`);
      }
      break;
    }
    case 'bloom_both': {
      applyStatus(attacker, 'bloom', { turns: 4, pct: 0.05 });
      const ownBench = side === 'player' ? state.bf : state.ebf;
      if (ownBench && ownBench.hp > 0) {
        applyStatus(ownBench, 'bloom', { turns: 4, pct: 0.05 });
        pushLog(`${displayName(attacker.creature)} and ${displayName(ownBench.creature)} are both blooming!`, 'eff');
      } else {
        pushLog(`${displayName(attacker.creature)} blooms.`);
      }
      break;
    }
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
  }
}
