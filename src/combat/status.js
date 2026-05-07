import { pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive } from './passives.js';
import { spawnFloat } from '../ui/animations.js';

// Apply or refresh a status. Iron Will blocks debuff statuses.
export function applyStatus(f, type, opts) {
  opts = opts || {};
  if (hasPassive(f, 'iron_will') && (type === 'soaking' || type === 'dazed' || type === 'cursed')) return false;
  if (type === 'burn') {
    f.statuses.burn = { turns: opts.turns || 4, percentPerTurn: opts.pct || 0.05 };
    return true;
  }
  if (type === 'bloom') {
    f.statuses.bloom = { turns: opts.turns || 4, percentPerTurn: opts.pct || 0.05 };
    return true;
  }
  if (type === 'soaking') {
    f.statuses.soaking = { turns: opts.turns || 4 };
    return true;
  }
  if (type === 'cursed') {
    f.statuses.cursed = { turns: opts.turns || 99, percentOnSwap: opts.pct || 0.30 };
    return true;
  }
  if (type === 'dazed') {
    f.statuses.dazed = { turns: opts.turns || 2 };
    return true;
  }
  return false;
}

export function cleanseStatuses(f) {
  f.statuses.burn = null;
  f.statuses.bloom = null;
  f.statuses.soaking = null;
  f.statuses.cursed = null;
  f.statuses.dazed = null;
}

// Tick statuses (burn/bloom/soaking/dazed/cursed). Used for active and bench fighters.
export function tickFighterStatuses(f, side, isBench) {
  if (isBench && hasPassive(f, 'sentinel')) {
    applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * 0.05)));
  }
  const spotterMult = (isBench && hasPassive(f, 'spotter')) ? 0.7 : 1.0;
  if (f.statuses.burn && f.statuses.burn.turns > 0) {
    const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.burn.percentPerTurn * spotterMult));
    f.hp = Math.max(0, f.hp - dmg);
    if (!isBench) {
      spawnFloat(side, String(dmg), 'dmg');
      pushLog(`${displayName(f.creature)} burns for ${dmg}.`);
    }
    f.statuses.burn.turns--;
    if (f.statuses.burn.turns <= 0) f.statuses.burn = null;
  }
  if (f.statuses.bloom && f.statuses.bloom.turns > 0) {
    const healed = applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * f.statuses.bloom.percentPerTurn)));
    if (healed > 0 && !isBench) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(f.creature)} blooms for +${healed}.`);
    }
    f.statuses.bloom.turns--;
    if (f.statuses.bloom.turns <= 0) f.statuses.bloom = null;
  }
  if (f.statuses.soaking && f.statuses.soaking.turns > 0) {
    f.statuses.soaking.turns--;
    if (f.statuses.soaking.turns <= 0) f.statuses.soaking = null;
  }
  if (f.statuses.dazed && f.statuses.dazed.turns > 0) {
    f.statuses.dazed.turns--;
    if (f.statuses.dazed.turns <= 0) f.statuses.dazed = null;
  }
  if (f.statuses.cursed && f.statuses.cursed.turns > 0) {
    f.statuses.cursed.turns--;
    if (f.statuses.cursed.turns <= 0) f.statuses.cursed = null;
  }
}

export function tickStartOfTurn(f, side) {
  if (f.healing && f.healing.turnsLeft > 0) {
    const healed = applyHeal(f, f.healing.perTurn);
    f.healing.turnsLeft--;
    if (f.healing.turnsLeft <= 0) f.healing = null;
    if (healed > 0) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(f.creature)} heals ${healed} from Mend.`);
    }
  }
  if (hasPassive(f, 'photosynthesis')) {
    const healed = applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * 0.06)));
    if (healed > 0) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(f.creature)}'s Photosynthesis heals ${healed}.`);
    }
  }
  if (hasPassive(f, 'hex_eater')) {
    if (f.statuses.soaking) f.statuses.soaking = null;
    else if (f.statuses.burn) f.statuses.burn = null;
    else if (f.statuses.dazed) f.statuses.dazed = null;
    else if (f.statMods.atk < 0) f.statMods.atk = Math.min(0, f.statMods.atk + 0.15);
    else if (f.statMods.def < 0) f.statMods.def = Math.min(0, f.statMods.def + 0.15);
    else if (f.statMods.spd < 0) f.statMods.spd = Math.min(0, f.statMods.spd + 0.15);
  }
  if (hasPassive(f, 'slow_burn')) {
    f.slowBurnStacks = Math.min(5, (f.slowBurnStacks || 0) + 1);
  }
  tickFighterStatuses(f, side, false);
  if (f.adrenalTurns > 0) {
    f.adrenalTurns--;
    if (f.adrenalTurns === 0 && f.adrenalAtkDelta) {
      f.statMods.atk -= f.adrenalAtkDelta;
      f.adrenalAtkDelta = 0;
    }
  }
  if (f.pendingSwapBuff) {
    for (const [k, v] of Object.entries(f.pendingSwapBuff)) {
      f.statMods[k] += v;
    }
    pushLog(`${displayName(f.creature)} arrives bolstered.`, 'eff');
    f.pendingSwapBuff = null;
  }
  if (f.pendingSwapHeal > 0) {
    const amt = Math.round(f.creature.maxHp * f.pendingSwapHeal);
    const healed = applyHeal(f, amt);
    if (healed > 0) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(f.creature)} arrives healed for ${healed}.`);
    }
    f.pendingSwapHeal = 0;
  }
  f.bracingThisTurn = false;
}

// Apply healing respecting Berserker (blocks), Blooming/Vampire Touch (amplify), Vampire Touch (overheal).
export function applyHeal(f, baseAmount) {
  if (hasPassive(f, 'berserker')) return 0;
  let amt = baseAmount;
  if (hasPassive(f, 'blooming') || hasPassive(f, 'vampire_touch')) amt = Math.round(amt * 1.5);
  const cap = hasPassive(f, 'vampire_touch')
    ? Math.round(f.creature.maxHp * 1.25)
    : f.creature.maxHp;
  const before = f.hp;
  f.hp = Math.min(cap, f.hp + amt);
  return f.hp - before;
}
