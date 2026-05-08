import { TYPE_CHART, ADDITIONAL_EFFECTS } from '../data.js';
import { rand } from '../rng.js';
import { hasPassive, applyStatMult, applyPowerMult, checkEvasion, getCritMult, applyFlatDmgReduction } from './passives.js';

// Resolves a fighter's effective stat after passive multipliers, status modifiers, and stat mods.
// Capped 0.25x..3.0x to prevent infinite Focus/Fury stacking.
export function effectiveStat(f, stat) {
  let m = 1 + f.statMods[stat];
  m = applyStatMult(f, stat, m);
  m = Math.max(0.25, Math.min(3.0, m));
  return Math.max(1, Math.round(f.creature.stats[stat] * m));
}

// Returns {dmg, mult, elem, crit, evaded?}
export function calculateDamage(attacker, defender, ability) {
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');
  {
    const piercer = (ability.additionalEffects || []).find(e => e.type === 'pierce');
    if (piercer) {
      const dr = piercer.defReduction ?? ADDITIONAL_EFFECTS.pierce?.params?.defReduction?.default ?? 0.5;
      def = Math.round(def * (1 - dr));
    }
  }
  const attackerSpd = effectiveStat(attacker, 'spd');
  const defenderSpd = effectiveStat(defender, 'spd');
  let power = applyPowerMult(attacker, defender, ability, ability.power, { attackerSpd, defenderSpd });
  const elem = ability.element || null;
  let mult = hasPassive(attacker, 'eldritch_sight') ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  if (checkEvasion(defender)) {
    return { dmg: 0, mult, elem, crit: false, evaded: true };
  }
  let raw = atk * (power / 50) * (atk / (atk + def)) * 0.55;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (defender.bracingThisTurn) raw *= 0.4;
  raw = applyFlatDmgReduction(defender, raw);
  const crit = Math.random() < 0.1;
  if (crit) raw *= getCritMult(attacker);
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
  {
    const piercer = (ability.additionalEffects || []).find(e => e.type === 'pierce');
    if (piercer) {
      const dr = piercer.defReduction ?? ADDITIONAL_EFFECTS.pierce?.params?.defReduction?.default ?? 0.5;
      def = Math.round(def * (1 - dr));
    }
  }
  const attackerSpd = effectiveStat(attacker, 'spd');
  const defenderSpd = effectiveStat(defender, 'spd');
  const power = applyPowerMult(attacker, defender, ability, ability.power, { attackerSpd, defenderSpd });
  const elem = ability.element || null;
  const mult = hasPassive(attacker, 'eldritch_sight') ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  let raw = atk * (power / 50) * (atk / (atk + def)) * 0.4;
  if (raw < 1) raw = 1;
  raw *= mult;
  raw = applyFlatDmgReduction(defender, raw);
  raw = Math.max(1, Math.round(raw));
  return raw;
}
