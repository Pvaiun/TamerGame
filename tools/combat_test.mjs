// Combat test suite. Run with:
//   node --experimental-loader ./tools/test_loader.mjs tools/combat_test.mjs

import { hasPassive, applyStatMult, applyPowerMult, applyFlatDmgReduction,
         getCritProfile, checkEvasion, modifyHeal, blocksStatus,
         bypassesTypeChart, applySelfDmgMult, winsTies,
         applyBattleStartPassive, applySwapInPassives,
         applyPostHitPassives, applyTurnStartPassives, applyBenchPassives,
} from '../src/combat/passives.js';

import { effectiveStat, calculateDamage, estimateDamage } from '../src/combat/damage.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${extra ? '  (' + extra + ')' : ''}`);
    failed++;
  }
}

function assertClose(label, actual, expected, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  assert(label, ok, `got ${actual.toFixed(4)}, expected ${expected.toFixed(4)}`);
}

function makeFighter(passives = [], stats = {}, overrides = {}) {
  const base = { hp: 50, atk: 20, def: 10, spd: 10, ...stats };
  return {
    creature: {
      passives,
      stats: base,
      maxHp: base.hp,
      type: 'fire',
    },
    hp: base.hp,
    statMods: { atk: 0, def: 0, spd: 0 },
    bracingThisTurn: false,
    statuses: { burn: null, bloom: null, soaking: null, cursed: null, dazed: null },
    consumedTriggers: new Set(),
    timedBuffs: [],
    attacksMade: 0,
    onBench: false,
    ...overrides,
  };
}

const NO_CBS = {
  applyStatus() {},
  applyHeal(f, a) { const actual = Math.min(f.creature.maxHp, f.hp + a) - f.hp; f.hp += actual; return actual; },
  spawnFloat() {},
  pushLog() {},
  displayName(c) { return c.species || 'X'; },
  cleanseStatuses() {},
};

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\n── Stat passives ────────────────────────────────────────────────');

{
  const f = makeFighter(['brutal']);
  assertClose('brutal: +50% ATK', applyStatMult(f, 'atk', 1.0), 1.5);
  assertClose('brutal: DEF unchanged', applyStatMult(f, 'def', 1.0), 1.0);
}

{
  const f = makeFighter(['swift']);
  assertClose('swift: +50% SPD', applyStatMult(f, 'spd', 1.0), 1.5);
  assertClose('swift: ATK unchanged', applyStatMult(f, 'atk', 1.0), 1.0);
}

{
  const f = makeFighter(['glass_cannon']);
  assertClose('glass_cannon: +75% ATK', applyStatMult(f, 'atk', 1.0), 1.75);
  assertClose('glass_cannon: -25% DEF', applyStatMult(f, 'def', 1.0), 0.75);
  assertClose('glass_cannon: SPD unchanged', applyStatMult(f, 'spd', 1.0), 1.0);
}

console.log('\n── Power passives ───────────────────────────────────────────────');

{
  const attacker = makeFighter(['pyromancer']);
  const burning  = makeFighter([], {}, { statuses: { burn: { turns: 2 }, bloom: null, soaking: null, cursed: null, dazed: null } });
  const healthy  = makeFighter();
  assertClose('pyromancer: +50% vs burning', applyPowerMult(attacker, burning, {}, 50, []), 75);
  assertClose('pyromancer: no bonus vs non-burning', applyPowerMult(attacker, healthy, {}, 50, []), 50);
}

{
  const attacker = makeFighter(['verdant_soul']);
  const defender  = makeFighter();
  assertClose('verdant_soul: +50% grass power', applyPowerMult(attacker, defender, { element: 'grass' }, 50, []), 75);
  assertClose('verdant_soul: no bonus non-grass', applyPowerMult(attacker, defender, { element: 'fire' }, 50, []), 50);
}

{
  const attacker = makeFighter(['predators_edge']);
  const healthy  = makeFighter([], { hp: 100 });
  const wounded  = makeFighter([], { hp: 100 }, { hp: 40 }); // 40% hp
  assertClose('predators_edge: +50% vs <50% HP', applyPowerMult(attacker, wounded, {}, 50, []), 75);
  assertClose('predators_edge: no bonus vs full HP', applyPowerMult(attacker, healthy, {}, 50, []), 50);
}

{
  const attacker = makeFighter(['pristine']);
  assertClose('pristine: first use 2× power', applyPowerMult(attacker, makeFighter(), {}, 50, []), 100);
  assertClose('pristine: consumed on 2nd use', applyPowerMult(attacker, makeFighter(), {}, 50, []), 50);
}

console.log('\n── Defense passives ─────────────────────────────────────────────');

{
  const f = makeFighter(['stone_skin']);
  assertClose('stone_skin: flat -3 reduction', applyFlatDmgReduction(f, 20, null), 17);
}

{
  const f = makeFighter(['bulwark']);
  const vs_nonelem = applyFlatDmgReduction(f, 20, null);
  const vs_elem    = applyFlatDmgReduction(f, 20, 'fire');
  assertClose('bulwark: non-elem ×0.7 = 14', vs_nonelem, 14);
  assertClose('bulwark: element unchanged = 20', vs_elem, 20);
}

console.log('\n── Crit passives ────────────────────────────────────────────────');

{
  const f = makeFighter(['lucky']);
  assertClose('lucky: crit chance 20%', getCritProfile(f).chance, 0.20);
}

{
  const f = makeFighter(['savage']);
  const profile = getCritProfile(f);
  // savage should boost crit damage
  assert('savage: crit mult > baseline 1.6', profile.mult > 1.6, `mult=${profile.mult}`);
}

console.log('\n── Evasion ──────────────────────────────────────────────────────');

{
  const f = makeFighter(['misty_form']);
  let evadeCount = 0;
  for (let i = 0; i < 2000; i++) if (checkEvasion(f)) evadeCount++;
  const rate = evadeCount / 2000;
  assert('misty_form: ~25% evasion rate (±5%)', rate > 0.20 && rate < 0.30,
         `got ${(rate * 100).toFixed(1)}%`);
}

console.log('\n── Heal passives ────────────────────────────────────────────────');

{
  const f = makeFighter(['berserker']);
  const { amount } = modifyHeal(f, 100);
  assert('berserker: blocks all heals', amount === 0, `got ${amount}`);
}

console.log('\n── Status block ─────────────────────────────────────────────────');

{
  const f = makeFighter(['iron_will']);
  assert('iron_will: blocks soaking', blocksStatus(f, 'soaking'));
  assert('iron_will: blocks dazed',   blocksStatus(f, 'dazed'));
  assert('iron_will: blocks cursed',  blocksStatus(f, 'cursed'));
  assert('iron_will: does NOT block burn', !blocksStatus(f, 'burn'));
}

{
  const f = makeFighter(['serene']);
  assert('serene: blocks dazed',          blocksStatus(f, 'dazed'));
  assert('serene: does NOT block burn',   !blocksStatus(f, 'burn'));
  assert('serene: does NOT block cursed', !blocksStatus(f, 'cursed'));
}

console.log('\n── Type-chart bypass ────────────────────────────────────────────');

{
  assert('eldritch_sight: bypasses type chart', bypassesTypeChart(makeFighter(['eldritch_sight'])));
  assert('no passive: does not bypass',         !bypassesTypeChart(makeFighter()));
}

console.log('\n── Tie break ────────────────────────────────────────────────────');

{
  assert('featherweight: wins ties',     winsTies(makeFighter(['featherweight'])));
  assert('no passive: does not win', !winsTies(makeFighter()));
}

console.log('\n── consumesOn: battle ────────────────────────────────────────────');

{
  const attacker = makeFighter(['pristine']);
  const p1 = applyPowerMult(attacker, makeFighter(), {}, 60, []);
  const p2 = applyPowerMult(attacker, makeFighter(), {}, 60, []);
  assertClose('pristine fires once (turn 1 = 120)', p1, 120);
  assertClose('pristine exhausted (turn 2 = 60)',   p2,  60);
}

console.log('\n── Echo Form turn stacking ──────────────────────────────────────');

{
  const f = makeFighter(['echo_form']);
  assert('echo_form: initially no ATK mod', f.statMods.atk === 0);
  applyTurnStartPassives(f, 'player', NO_CBS);
  assertClose('echo_form: +25% ATK after turn 1', f.statMods.atk, 0.25);
  applyTurnStartPassives(f, 'player', NO_CBS);
  assertClose('echo_form: +50% ATK after turn 2', f.statMods.atk, 0.50);
}

console.log('\n── Aquaveil once-per-battle ─────────────────────────────────────');

{
  const f = makeFighter(['aquaveil'], { hp: 50 });
  f.hp = 24; // below 50%
  applyPostHitPassives('enemy', 'player', makeFighter(), f, { dmg: 1 }, NO_CBS);
  assert('aquaveil: hp restored to 50%', f.hp === 25, `hp = ${f.hp}`);
  f.hp = 10;
  applyPostHitPassives('enemy', 'player', makeFighter(), f, { dmg: 1 }, NO_CBS);
  assert('aquaveil: does not fire again', f.hp === 10, `hp = ${f.hp}`);
}

console.log('\n── Riposte (reflect damage) ─────────────────────────────────────');

{
  const defender = makeFighter(['riposte'], { hp: 100 });
  const attacker = makeFighter([], { hp: 100 });
  applyPostHitPassives('enemy', 'player', attacker, defender, { dmg: 40 }, NO_CBS);
  assert('riposte: attacker takes reflected damage', attacker.hp < 100,
         `attacker hp = ${attacker.hp}`);
}

console.log('\n── effectiveStat ────────────────────────────────────────────────');

{
  const f = makeFighter(['brutal'], { atk: 20 });
  assert('effectiveStat brutal: 20×1.5=30', effectiveStat(f, 'atk') === 30);
}

{
  const f = makeFighter(['glass_cannon'], { atk: 20, def: 20 });
  assert('effectiveStat glass_cannon atk: 20×1.75=35', effectiveStat(f, 'atk') === 35);
  assert('effectiveStat glass_cannon def: 20×0.75=15', effectiveStat(f, 'def') === 15);
}

console.log('\n── calculateDamage smoke test ────────────────────────────────────');

{
  const att = makeFighter([], { atk: 30, spd: 15 });
  const def = makeFighter([], { def: 10, hp: 100 });
  const result = calculateDamage(att, def, { element: null }, { power: 50 }, []);
  assert('calculateDamage: returns dmg > 0', result.dmg > 0, `dmg=${result.dmg}`);
  assert('calculateDamage: no evade flag', !result.evaded);
}

{
  // Glass cannon should deal more damage than plain attacker
  const plain  = makeFighter([], { atk: 20 });
  const cannon = makeFighter(['glass_cannon'], { atk: 20 });
  const def    = makeFighter([], { def: 10, hp: 200 });
  const r1 = estimateDamage(plain,  def, { element: null, phases: [[{ type: 'damage', power: 50 }]] });
  const r2 = estimateDamage(cannon, def, { element: null, phases: [[{ type: 'damage', power: 50 }]] });
  assert('glass_cannon deals more damage than plain', r2 > r1, `plain=${r1} cannon=${r2}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
