import { PASSIVES, ADDITIONAL_EFFECTS } from '../data.js';

export function hasPassive(f, key) {
  return f.creature.passives && f.creature.passives.includes(key);
}

// Read params for a passive from the JSON data.
function p(key) {
  return PASSIVES[key] || {};
}

// --- Stat multiplier passives ---
// Called from damage.js effectiveStat() with the raw multiplier before clamping.
export function applyStatMult(f, stat, m) {
  if (stat === 'atk') {
    if (hasPassive(f, 'brutal'))      m *= p('brutal').atkMult;
    if (hasPassive(f, 'glass_cannon')) m *= p('glass_cannon').atkMult;
    if (hasPassive(f, 'iron_grip'))   m *= p('iron_grip').atkMult;
    if (hasPassive(f, 'giant_form'))  m *= p('giant_form').atkMult;
    if (hasPassive(f, 'berserker'))   m *= p('berserker').atkMult;
    if (hasPassive(f, 'dark_pact') && f.dpApplied) m *= p('dark_pact').atkMult;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > p('lightbearer').hpThreshold) m *= p('lightbearer').statMult;
    if (hasPassive(f, 'mortal_coil') && (f.hp / f.creature.maxHp) < p('mortal_coil').hpThreshold) m *= p('mortal_coil').statMult;
    if (f.statuses && f.statuses.soaking) m *= 0.5;
    if (hasPassive(f, 'slow_burn') && f.slowBurnStacks) {
      m *= (1 + p('slow_burn').atkBonusPerStack * Math.min(p('slow_burn').maxStacks, f.slowBurnStacks));
    }
    if (hasPassive(f, 'rearguard') && f.onBench) m *= p('rearguard').benchMult;
  }
  if (stat === 'def') {
    if (hasPassive(f, 'tide_guard'))   m *= p('tide_guard').defMult;
    if (hasPassive(f, 'iron_grip'))    m *= p('iron_grip').defMult;
    if (hasPassive(f, 'glass_cannon')) m *= p('glass_cannon').defMult;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > p('lightbearer').hpThreshold) m *= p('lightbearer').statMult;
    if (hasPassive(f, 'rearguard') && f.onBench) m *= p('rearguard').benchMult;
  }
  if (stat === 'spd') {
    if (hasPassive(f, 'swift'))       m *= p('swift').spdMult;
    if (hasPassive(f, 'giant_form'))  m *= p('giant_form').spdMult;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > p('lightbearer').hpThreshold) m *= p('lightbearer').statMult;
    if (hasPassive(f, 'mortal_coil') && (f.hp / f.creature.maxHp) < p('mortal_coil').hpThreshold) m *= p('mortal_coil').statMult;
    if (hasPassive(f, 'rearguard') && f.onBench) m *= p('rearguard').benchMult;
  }
  return m;
}

// --- Power modifier passives ---
// Called from damage.js calculateDamage() and estimateDamage().
// attackerSpd/defenderSpd are pre-computed and passed in to avoid re-calling effectiveStat.
export function applyPowerMult(attacker, defender, ability, power, { attackerSpd = 0, defenderSpd = 0 } = {}) {
  const elem = ability.element || null;
  if (elem) {
    for (const key of ['inferno_heart', 'tide_blessed', 'verdant_soul', 'sunforged', 'shadowforged']) {
      if (hasPassive(attacker, key) && p(key).elem === elem) {
        power *= p(key).elemPowerMult;
        break;
      }
    }
  }
  if (hasPassive(attacker, 'predators_edge') && (defender.hp / defender.creature.maxHp) < p('predators_edge').defenderHpThreshold) {
    power *= p('predators_edge').powerMult;
  }
  if (hasPassive(attacker, 'cornered') && (attacker.hp / attacker.creature.maxHp) < p('cornered').selfHpThreshold) {
    power *= p('cornered').powerMult;
  }
  {
    const exec = (ability.additionalEffects || []).find(e => e.type === 'execute_scale');
    if (exec) {
      const sa = exec.scaleAmount ?? ADDITIONAL_EFFECTS.execute_scale?.params?.scaleAmount?.default ?? 0.5;
      power *= 1 + sa * (1 - (defender.hp / defender.creature.maxHp));
    }
  }
  {
    const syn = (ability.additionalEffects || []).find(e => e.type === 'status_synergy');
    if (syn && defender.statuses) {
      const status = syn.status ?? ADDITIONAL_EFFECTS.status_synergy?.params?.status?.default ?? 'cursed';
      const mult   = syn.powerMult ?? ADDITIONAL_EFFECTS.status_synergy?.params?.powerMult?.default ?? 1.5;
      if (defender.statuses[status]) power *= mult;
    }
  }
  if (hasPassive(attacker, 'tempo') && attackerSpd > defenderSpd) {
    power *= p('tempo').powerMult;
  }
  if (hasPassive(attacker, 'pristine') && !attacker.pristineUsed) {
    power *= p('pristine').powerMult;
    attacker.pristineUsed = true;
  }
  if (hasPassive(attacker, 'patient_hunter') && attacker.patientStacks) {
    power *= (1 + p('patient_hunter').powerBonusPerStack * Math.min(p('patient_hunter').maxStacks, attacker.patientStacks));
    attacker.patientStacks = 0;
  }
  if (hasPassive(attacker, 'status_lord') && defender.statuses) {
    const count = ['burn', 'bloom', 'soaking', 'cursed', 'dazed'].filter(s => defender.statuses[s]).length;
    if (count > 0) power *= (1 + p('status_lord').powerBonusPerStatus * count);
  }
  if (hasPassive(attacker, 'zealot') && attacker.zealotPrimed) {
    power *= p('zealot').powerMult;
    attacker.zealotPrimed = false;
  }
  return power;
}

// --- Evasion check ---
// Called from damage.js calculateDamage(). Returns true if the attack is evaded.
export function checkEvasion(defender) {
  if (hasPassive(defender, 'misty_form')) {
    return Math.random() < p('misty_form').evadeChance;
  }
  return false;
}

// --- Crit multiplier ---
// Called from damage.js calculateDamage(). Returns the multiplier to apply on a crit.
export function getCritMult(attacker) {
  if (hasPassive(attacker, 'doubling_down') && (attacker.hp / attacker.creature.maxHp) > p('doubling_down').hpThreshold) {
    return p('doubling_down').critMult;
  }
  return 1.6;
}

// --- Flat damage reduction ---
// Called from damage.js calculateDamage() after raw damage is computed.
export function applyFlatDmgReduction(defender, raw) {
  if (hasPassive(defender, 'stone_skin')) raw -= p('stone_skin').flatDmgReduction;
  return raw;
}

// --- Status block check ---
// Called from status.js applyStatus(). Any passive with a blocksStatuses array is checked.
export function blocksStatus(f, statusType) {
  for (const key of (f.creature.passives || [])) {
    const params = PASSIVES[key];
    if (params && params.blocksStatuses && params.blocksStatuses.includes(statusType)) return true;
  }
  return false;
}

// --- Heal modifier ---
// Called from status.js applyHeal(). Returns { amount, cap }.
export function modifyHeal(f, baseAmount) {
  if (hasPassive(f, 'berserker')) return { amount: 0, cap: f.creature.maxHp };
  let amt = baseAmount;
  if (hasPassive(f, 'blooming'))       amt = Math.round(amt * p('blooming').healMult);
  else if (hasPassive(f, 'vampire_touch')) amt = Math.round(amt * p('vampire_touch').healMult);
  const cap = hasPassive(f, 'vampire_touch')
    ? Math.round(f.creature.maxHp * p('vampire_touch').overhealCap)
    : f.creature.maxHp;
  return { amount: amt, cap };
}

// --- Battle-start passives ---
// Called from battle.js for each fighter at battle start.
// Handles thick_hide, dark_pact (self), dreadful, prepared (opponent-targeting).
export function applyBattleStartPassive(f, opponent, cbs) {
  const { applyStatus } = cbs;
  if (hasPassive(f, 'thick_hide')) {
    f.hp += Math.round(f.creature.maxHp * p('thick_hide').healPct);
  }
  if (hasPassive(f, 'dark_pact')) {
    const cost = Math.round(f.creature.maxHp * p('dark_pact').hpCostPct);
    f.hp = Math.max(1, f.hp - cost);
    f.dpApplied = true;
  }
  if (hasPassive(f, 'dreadful')) {
    opponent.hp = Math.max(1, opponent.hp - Math.round(opponent.creature.maxHp * p('dreadful').damagePct));
  }
  if (hasPassive(f, 'prepared')) {
    for (const se of (p('prepared').statusEffects || [])) {
      for (const tk of (se.targets || [])) {
        const target = tk === 'enemy' ? opponent : f;
        applyStatus(target, se.status, {});
      }
    }
  }
}

// --- Swap-in passives ---
// Called from battle.js when a fighter enters the field.
// Handles vanguard, second_wind (incoming), tag_out (outgoing cleanse).
export function applySwapInPassives(incoming, outgoing, side, cbs) {
  const { applyHeal, cleanseStatuses, spawnFloat, pushLog, displayName } = cbs;
  if (hasPassive(incoming, 'vanguard')) {
    incoming.statMods.atk += p('vanguard').atkMod;
    incoming.vanguardActive = true;
    pushLog(`${displayName(incoming.creature)}'s Vanguard surges forward!`, 'eff');
  }
  if (hasPassive(incoming, 'second_wind')) {
    const healed = applyHeal(incoming, Math.round(incoming.creature.maxHp * p('second_wind').healPct));
    if (healed > 0) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(incoming.creature)}'s Second Wind heals ${healed}.`);
    }
  }
  if (hasPassive(outgoing, 'tag_out')) {
    cleanseStatuses(incoming);
    pushLog(`Tag Out cleanses ${displayName(incoming.creature)}.`, 'eff');
  }
}

// --- Post-hit passives ---
// Called from abilities.js after every damaging hit lands.
export function applyPostHitPassives(side, oside, attacker, defender, result, cbs) {
  const { applyHeal, applyStatus, spawnFloat, pushLog, displayName } = cbs;
  if (hasPassive(defender, 'adrenal_surge') && defender.hp > 0) {
    if (result.dmg >= defender.creature.maxHp * p('adrenal_surge').triggerThreshold) {
      if (!defender.adrenalTurns) {
        defender.statMods.atk += p('adrenal_surge').atkMod;
        defender.adrenalAtkDelta = p('adrenal_surge').atkMod;
      }
      defender.adrenalTurns = p('adrenal_surge').duration;
      pushLog(`${displayName(defender.creature)}'s Adrenal Surge triggers (+${Math.round(p('adrenal_surge').atkMod * 100)}% ATK)!`, 'eff');
    }
  }
  if (hasPassive(attacker, 'soul_drain')) {
    const healed = applyHeal(attacker, Math.round(result.dmg * p('soul_drain').healPct));
    if (healed > 0) spawnFloat(side, `+${healed}`, 'heal');
  }
  if (hasPassive(defender, 'riposte') && defender.hp > 0) {
    const back = Math.round(result.dmg * p('riposte').reflectPct);
    attacker.hp = Math.max(0, attacker.hp - back);
    spawnFloat(side, String(back), 'dmg');
    pushLog(`${displayName(defender.creature)}'s Riposte deals ${back} back.`);
  }
  if (hasPassive(defender, 'counterstance') && defender.bracingThisTurn && defender.hp > 0) {
    const back = Math.round(result.dmg * p('counterstance').reflectPct);
    attacker.hp = Math.max(0, attacker.hp - back);
    spawnFloat(side, String(back), 'dmg');
    pushLog(`${displayName(defender.creature)}'s Counterstance reflects ${back}!`, 'eff');
  }
  if (hasPassive(defender, 'aquaveil') && !defender.aquaveilUsed) {
    const threshold = Math.round(defender.creature.maxHp * p('aquaveil').restoreThreshold);
    if (defender.hp < threshold && defender.hp > 0) {
      defender.hp = threshold;
      defender.aquaveilUsed = true;
      spawnFloat(oside, `+${threshold}`, 'heal');
      pushLog(`${displayName(defender.creature)}'s Aquaveil triggers!`, 'eff');
    }
  }
  if (hasPassive(attacker, 'frostbite') && defender.hp > 0 && !hasPassive(defender, 'iron_will')) {
    defender.statMods.spd -= p('frostbite').spdPenalty;
  }
}

// --- Turn-start passives ---
// Called from status.js tickStartOfTurn() before status ticks.
export function applyTurnStartPassives(f, side, cbs) {
  const { applyHeal, spawnFloat, pushLog, displayName } = cbs;
  if (hasPassive(f, 'photosynthesis')) {
    const healed = applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * p('photosynthesis').healPct)));
    if (healed > 0) {
      spawnFloat(side, `+${healed}`, 'heal');
      pushLog(`${displayName(f.creature)}'s Photosynthesis heals ${healed}.`);
    }
  }
  if (hasPassive(f, 'hex_eater')) {
    const step = p('hex_eater').statRestoreStep;
    if (f.statuses.soaking)       f.statuses.soaking = null;
    else if (f.statuses.burn)     f.statuses.burn = null;
    else if (f.statuses.dazed)    f.statuses.dazed = null;
    else if (f.statMods.atk < 0)  f.statMods.atk = Math.min(0, f.statMods.atk + step);
    else if (f.statMods.def < 0)  f.statMods.def = Math.min(0, f.statMods.def + step);
    else if (f.statMods.spd < 0)  f.statMods.spd = Math.min(0, f.statMods.spd + step);
  }
  if (hasPassive(f, 'slow_burn')) {
    f.slowBurnStacks = Math.min(p('slow_burn').maxStacks, (f.slowBurnStacks || 0) + 1);
  }
}

// --- Bench-tick passives ---
// Called from status.js tickFighterStatuses().
// Returns the burn damage multiplier (spotter) for the caller to use.
export function applyBenchPassives(f, isBench, cbs) {
  const { applyHeal } = cbs;
  if (isBench && hasPassive(f, 'sentinel')) {
    applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * p('sentinel').healPct)));
  }
  return (isBench && hasPassive(f, 'spotter')) ? p('spotter').burnDmgMult : 1.0;
}
