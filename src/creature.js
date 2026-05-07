import { rand, pickN } from './rng.js';
import { TYPE_PALETTE } from './data.js';
import { MAX_LEVEL, nextCreatureId } from './state.js';

export function makeCreature(template, level = 1, options = {}) {
  // Build stats from base, then apply per-level growth.
  // HP gets 4x scaling because HP numbers are ~5x other stats; without scaling, S-rank HP growth
  // would only add ~3 HP/level, which feels worthless. With 4x: S HP growth = ~10 HP/level.
  const stats = { ...template.baseStats };
  for (let l = 2; l <= level; l++) {
    stats.hp  += Math.max(1, Math.round(template.growth.hp  * 4 + rand(-0.5, 1)));
    stats.atk += Math.max(0, Math.round(template.growth.atk * 2 + rand(-0.5, 1)));
    stats.def += Math.max(0, Math.round(template.growth.def * 2 + rand(-0.5, 1)));
    stats.spd += Math.max(0, Math.round(template.growth.spd * 2 + rand(-0.5, 1)));
  }
  stats.hp  = Math.max(8, stats.hp);
  stats.atk = Math.max(2, stats.atk);
  stats.def = Math.max(1, stats.def);
  stats.spd = Math.max(1, stats.spd);

  const abilities = options.abilities || pickN(template.abilityPool, 4);
  // Each species has TWO unique passives. The creature rolls one of them on creation
  // (70% primary, 30% secondary) — never both.
  let passives;
  if (options.passives) {
    passives = options.passives;
  } else {
    const rolledPassive = Math.random() < 0.30
      ? template.secondaryPassive
      : template.primaryPassive;
    passives = [rolledPassive];
  }
  const palette = options.palette || TYPE_PALETTE[template.type];
  const growth = options.growth || template.growth;
  return {
    id: nextCreatureId(),
    species: template.species,
    type: options.type || template.type,
    growth,
    level,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: options.customName || null,
  };
}

// XP curve scales for level cap of 50. Total XP from L1 to L50 ≈ 30,500.
export function xpToNext(level) { return level * 25; }

export function gainXp(creature, amount) {
  const events = [];
  if (creature.level >= MAX_LEVEL) return events;
  creature.xp += amount;
  while (creature.xp >= xpToNext(creature.level) && creature.level < MAX_LEVEL) {
    creature.xp -= xpToNext(creature.level);
    creature.level++;
    const dHp  = Math.max(1, Math.round(creature.growth.hp  * 4 + rand(-0.5, 1.5)));
    const dAtk = Math.max(0, Math.round(creature.growth.atk * 2 + rand(-0.5, 1.5)));
    const dDef = Math.max(0, Math.round(creature.growth.def * 2 + rand(-0.5, 1.5)));
    const dSpd = Math.max(0, Math.round(creature.growth.spd * 2 + rand(-0.5, 1.5)));
    creature.stats.hp += dHp;
    creature.stats.atk += dAtk;
    creature.stats.def += dDef;
    creature.stats.spd += dSpd;
    creature.maxHp = creature.stats.hp;
    events.push({ level: creature.level, deltas: { hp: dHp, atk: dAtk, def: dDef, spd: dSpd } });
  }
  if (creature.level >= MAX_LEVEL) creature.xp = 0;
  return events;
}

// Same threshold across all stats so a "B HP" and a "B ATK" mean the same growth quality.
export function growthRank(g) {
  if (g >= 2.6) return 'S';
  if (g >= 2.2) return 'A';
  if (g >= 1.8) return 'B';
  if (g >= 1.4) return 'C';
  if (g >= 1.0) return 'D';
  if (g >= 0.6) return 'E';
  return 'F';
}

export function rankColor(r) {
  return ({
    'S': '#ffcc44', 'A': '#66cc66', 'B': '#88cc55',
    'C': '#cccc55', 'D': '#cc9955', 'E': '#cc7755', 'F': '#cc5555',
  })[r] || '#888';
}

export function displayName(c) {
  return c.customName || `${c.species} L${c.level}`;
}

// In-battle wrapper around a creature. Holds mutable battle state (hp, statuses, mods)
// separate from the creature object so the underlying creature is unchanged after a fight.
export function freshFighter(c) {
  return {
    creature: c,
    hp: c.maxHp,
    statMods: { atk: 0, def: 0, spd: 0 },
    bracingThisTurn: false,
    healing: null,
    aquaveilUsed: false,
    dpApplied: false,
    statuses: {
      burn: null,
      bloom: null,
      soaking: null,
      cursed: null,
      dazed: null,
    },
    pendingSwapBuff: null,
    pendingSwapHeal: 0,
  };
}
