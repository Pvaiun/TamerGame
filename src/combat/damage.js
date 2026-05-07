import { TYPE_CHART } from '../data.js';
import { rand } from '../rng.js';
import { hasPassive } from './passives.js';

// Resolves a fighter's effective stat after passive multipliers, status modifiers, and stat mods.
// Capped 0.25x..3.0x to prevent infinite Focus/Fury stacking.
export function effectiveStat(f, stat) {
  let m = 1 + f.statMods[stat];
  if (stat === 'atk') {
    if (hasPassive(f, 'brutal')) m *= 1.5;
    if (hasPassive(f, 'glass_cannon')) m *= 1.75;
    if (hasPassive(f, 'iron_grip')) m *= 1.3;
    if (hasPassive(f, 'giant_form')) m *= 1.2;
    if (hasPassive(f, 'berserker')) m *= 1.4;
    if (hasPassive(f, 'dark_pact') && f.dpApplied) m *= 1.5;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > 0.8) m *= 1.25;
    if (hasPassive(f, 'mortal_coil') && (f.hp / f.creature.maxHp) < 0.25) m *= 1.5;
    if (f.statuses && f.statuses.soaking) m *= 0.5;
    if (hasPassive(f, 'slow_burn') && f.slowBurnStacks) m *= (1 + 0.10 * Math.min(5, f.slowBurnStacks));
    if (hasPassive(f, 'rearguard') && f.onBench) m *= 1.25;
  }
  if (stat === 'def') {
    if (hasPassive(f, 'tide_guard')) m *= 1.5;
    if (hasPassive(f, 'iron_grip')) m *= 1.3;
    if (hasPassive(f, 'glass_cannon')) m *= 0.75;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > 0.8) m *= 1.25;
    if (hasPassive(f, 'rearguard') && f.onBench) m *= 1.25;
  }
  if (stat === 'spd') {
    if (hasPassive(f, 'swift')) m *= 1.5;
    if (hasPassive(f, 'giant_form')) m *= 0.8;
    if (hasPassive(f, 'lightbearer') && (f.hp / f.creature.maxHp) > 0.8) m *= 1.25;
    if (hasPassive(f, 'mortal_coil') && (f.hp / f.creature.maxHp) < 0.25) m *= 1.5;
    if (hasPassive(f, 'rearguard') && f.onBench) m *= 1.25;
  }
  m = Math.max(0.25, Math.min(3.0, m));
  return Math.max(1, Math.round(f.creature.stats[stat] * m));
}

// Returns {dmg, mult, elem, crit, evaded?}
export function calculateDamage(attacker, defender, ability) {
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');
  if (ability.effect === 'pierce') def = Math.round(def * 0.5);
  let power = ability.power;
  const elem = ability.element || null;
  if (hasPassive(attacker, 'inferno_heart') && elem === 'fire') power *= 1.5;
  if (hasPassive(attacker, 'tide_blessed') && elem === 'water') power *= 1.5;
  if (hasPassive(attacker, 'verdant_soul') && elem === 'grass') power *= 1.5;
  if (hasPassive(attacker, 'sunforged') && elem === 'light') power *= 1.5;
  if (hasPassive(attacker, 'shadowforged') && elem === 'dark') power *= 1.5;
  if (hasPassive(attacker, 'predators_edge') && (defender.hp / defender.creature.maxHp) < 0.5) power *= 1.5;
  if (hasPassive(attacker, 'cornered') && (attacker.hp / attacker.creature.maxHp) < 0.30) power *= 1.5;
  if (ability.effect === 'execute_scale') {
    const missing = 1 - (defender.hp / defender.creature.maxHp);
    power *= 1 + 0.5 * missing;
  }
  if (ability.effect === 'cursed_synergy' && defender.statuses && defender.statuses.cursed) {
    power *= 1.5;
  }
  if (hasPassive(attacker, 'tempo') && effectiveStat(attacker, 'spd') > effectiveStat(defender, 'spd')) power *= 1.25;
  if (hasPassive(attacker, 'pristine') && !attacker.pristineUsed) {
    power *= 2;
    attacker.pristineUsed = true;
  }
  if (hasPassive(attacker, 'patient_hunter') && attacker.patientStacks) {
    power *= (1 + 0.50 * Math.min(3, attacker.patientStacks));
    attacker.patientStacks = 0;
  }
  if (hasPassive(attacker, 'status_lord') && defender.statuses) {
    let count = 0;
    if (defender.statuses.burn) count++;
    if (defender.statuses.bloom) count++;
    if (defender.statuses.soaking) count++;
    if (defender.statuses.cursed) count++;
    if (defender.statuses.dazed) count++;
    if (count > 0) power *= (1 + 0.30 * count);
  }
  if (hasPassive(attacker, 'zealot') && attacker.zealotPrimed) {
    power *= 1.5;
    attacker.zealotPrimed = false;
  }
  let mult = 1;
  if (hasPassive(attacker, 'eldritch_sight')) {
    mult = 1;
  } else if (elem) {
    mult = TYPE_CHART[elem][defender.creature.type];
  }
  if (hasPassive(defender, 'misty_form') && Math.random() < 0.25) {
    return { dmg: 0, mult, elem, crit: false, evaded: true };
  }
  let raw = atk * (power / 50) * (atk / (atk + def)) * 0.55;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (defender.bracingThisTurn) raw *= 0.4;
  if (hasPassive(defender, 'stone_skin')) raw -= 3;
  const crit = Math.random() < 0.1;
  if (crit) {
    let critMult = 1.6;
    if (hasPassive(attacker, 'doubling_down') && (attacker.hp / attacker.creature.maxHp) > 0.5) critMult = 3.0;
    raw *= critMult;
  }
  raw *= rand(0.92, 1.08);
  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Deterministic average-damage estimate for the move-button UI. No crit/random/evade.
export function estimateDamage(attacker, defender, ability) {
  if (!ability.power || ability.power <= 0) return 0;
  if (ability.kind !== 'attack' && ability.kind !== 'charge_attack') return 0;
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');
  if (ability.effect === 'pierce') def = Math.round(def * 0.5);
  let power = ability.power;
  const elem = ability.element || null;
  if (hasPassive(attacker, 'inferno_heart') && elem === 'fire') power *= 1.5;
  if (hasPassive(attacker, 'predators_edge') && (defender.hp / defender.creature.maxHp) < 0.5) power *= 1.5;
  if (hasPassive(attacker, 'tempo') && effectiveStat(attacker, 'spd') > effectiveStat(defender, 'spd')) power *= 1.25;
  if (hasPassive(attacker, 'berserker')) power *= 1.4;
  if (hasPassive(attacker, 'slow_burn') && attacker.slowBurnStacks) power *= (1 + 0.10 * Math.min(5, attacker.slowBurnStacks));
  if (hasPassive(attacker, 'mortal_coil') && (attacker.hp / attacker.creature.maxHp) < 0.25) power *= 1.5;
  let mult = 1;
  if (!hasPassive(attacker, 'eldritch_sight') && elem) mult = TYPE_CHART[elem][defender.creature.type];
  let raw = atk * (power / 50) * (atk / (atk + def)) * 0.4;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (hasPassive(defender, 'stone_skin')) raw -= 3;
  raw = Math.max(1, Math.round(raw));
  return raw;
}
