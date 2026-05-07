import { pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { blocksStatus, modifyHeal, applyBenchPassives, applyTurnStartPassives } from './passives.js';
import { spawnFloat } from '../ui/animations.js';

// Apply or refresh a status. Passives with blocksStatuses block matching types.
export function applyStatus(f, type, opts) {
  opts = opts || {};
  if (blocksStatus(f, type)) return false;
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
  const spotterMult = applyBenchPassives(f, isBench, { applyHeal });
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
  applyTurnStartPassives(f, side, { applyHeal, spawnFloat, pushLog, displayName });
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

// Apply healing respecting passive modifiers (berserker blocks, blooming/vampire_touch amplify).
export function applyHeal(f, baseAmount) {
  const { amount, cap } = modifyHeal(f, baseAmount);
  const before = f.hp;
  f.hp = Math.min(cap, f.hp + amount);
  return f.hp - before;
}
