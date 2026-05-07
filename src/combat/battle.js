import { ABILITIES } from '../data.js';
import { sleep } from '../rng.js';
import { state, pushLog, TOTAL_WAVES } from '../state.js';
import { displayName, gainXp, freshFighter } from '../creature.js';
import { sfx } from '../audio.js';
import { hasPassive, applyBattleStartPassive, applySwapInPassives } from './passives.js';
import { effectiveStat, calculateDamage } from './damage.js';
import { applyStatus, cleanseStatuses, applyHeal, tickStartOfTurn, tickFighterStatuses } from './status.js';
import { aiChoose } from './ai.js';
import { processPostHit, resolveAbilityEffect, applyCursedOnSwap } from './abilities.js';
import { spawnFloat, spawnCallout, shakeStage, playLunge, playRecoil } from '../ui/animations.js';
import { render } from '../ui/render.js';

// Battle-start passive triggers (thick_hide, dark_pact, dreadful, prepared).
// Called once for each fighter pair when a battle begins.
function applyBattleStartPassives(pf, ef) {
  const cbs = { applyStatus };
  applyBattleStartPassive(pf, ef, cbs);
  applyBattleStartPassive(ef, pf, cbs);
}

export function beginBattle() {
  const playerActive = state.party[state.activeIdx];
  const playerBench = state.party[1 - state.activeIdx] || null;
  state.pf = freshFighter(playerActive);
  state.bf = playerBench ? freshFighter(playerBench) : null;
  state.enemyActiveIdx = 0;
  state.ef = freshFighter(state.enemyParty[0]);
  state.ebf = state.enemyParty.length > 1 ? freshFighter(state.enemyParty[1]) : null;
  state.enemy = state.enemyParty[0];
  applyBattleStartPassives(state.pf, state.ef);
  if (state.bf) applyBattleStartPassives(state.bf, state.ef);
  if (state.ebf) applyBattleStartPassives(state.ebf, state.pf);
  state.pCharge = null;
  state.eCharge = null;
  state.log = [];
  const enemiesDesc = state.enemyParty.map(e => displayName(e)).join(' and ');
  pushLog(`Wild ${enemiesDesc} appear.`);
  state.acting = false;
  state.screen = 'battle';
  render();
}

// High-priority swap; opponent still acts on the new active.
export async function playerSwap() {
  if (state.acting) return;
  if (!state.bf || state.bf.hp <= 0) return;
  state.acting = true;
  applyCursedOnSwap(state.pf, 'player');
  if (state.pf.charging) {
    pushLog(`${displayName(state.pf.creature)}'s ${state.pf.chargeAbility.name} fizzles!`, 'eff');
    state.pf.charging = null;
    state.pf.chargeAbility = null;
  }
  pushLog(`${displayName(state.pf.creature)} swaps to the bench.`, 'eff');
  sfx('select');
  const out = state.pf;
  state.pf = state.bf;
  state.bf = out;
  state.activeIdx = 1 - state.activeIdx;
  state.pf.onBench = false;
  state.bf.onBench = true;
  const swapCbs = { applyHeal, cleanseStatuses, spawnFloat, pushLog, displayName };
  applySwapInPassives(state.pf, out, 'player', swapCbs);
  render();
  await sleep(500);
  if (state.ef.hp > 0 && state.pf.hp > 0) {
    let releasing = false;
    let enemyAbility;
    if (state.ef.charging) {
      releasing = true;
      enemyAbility = state.ef.chargeAbility;
    } else {
      enemyAbility = ABILITIES[aiChoose(state.ef, state.pf)];
    }
    tickStartOfTurn(state.ef, 'enemy');
    if (state.ef.hp > 0) {
      if (releasing) {
        state.ef.charging = null;
        state.ef.chargeAbility = null;
        await releaseCharge('enemy', state.ef, state.pf, enemyAbility);
      } else {
        await resolveAction('enemy', state.ef, state.pf, enemyAbility);
      }
      render();
      await sleep(500);
    }
  }
  if (state.bf && state.bf.hp > 0) tickFighterStatuses(state.bf, 'player', true);
  if (state.ebf && state.ebf.hp > 0) tickFighterStatuses(state.ebf, 'enemy', true);
  await handleFaintsIfAny();
  state.acting = false;
  render();
}

// Force-swap to bench when active faints. Returns true if battle continues, false if ended.
export async function handleFaintsIfAny() {
  if (state.pf.hp <= 0) {
    pushLog(`${displayName(state.pf.creature)} fainted!`, 'eff');
    sfx('faint');
    if (state.bf && state.bf.hp > 0) {
      pushLog(`${displayName(state.bf.creature)} steps in.`, 'eff');
      const out = state.pf;
      state.pf = state.bf;
      state.bf = out;
      state.activeIdx = 1 - state.activeIdx;
      state.pCharge = null;
      render();
      await sleep(700);
    } else {
      state.screen = 'gameover';
      render();
      return false;
    }
  }
  if (state.ef.hp <= 0) {
    pushLog(`${displayName(state.ef.creature)} fainted!`, 'eff');
    sfx('faint');
    if (state.ebf && state.ebf.hp > 0) {
      pushLog(`${displayName(state.ebf.creature)} steps in.`, 'eff');
      const out = state.ef;
      state.ef = state.ebf;
      state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
      state.eCharge = null;
      render();
      await sleep(700);
    } else {
      render();
      await sleep(700);
      finishBattleIfDone();
      return false;
    }
  }
  return true;
}

export async function playerAct(abilityKey) {
  if (state.acting) return;
  state.acting = true;

  let pReleasing = false;
  let playerAbility;
  if (state.pf.charging) {
    pReleasing = true;
    playerAbility = state.pf.chargeAbility;
  } else {
    playerAbility = ABILITIES[abilityKey];
  }

  let eReleasing = false;
  let enemyAbility;
  let enemySwapping = false;
  if (state.ef.charging) {
    eReleasing = true;
    enemyAbility = state.ef.chargeAbility;
  } else {
    const enemyKey = aiChoose(state.ef, state.pf);
    if (enemyKey === '_swap') {
      enemySwapping = true;
      enemyAbility = { name: 'Swap', kind: 'swap_self', priority: 3 };
    } else {
      enemyAbility = ABILITIES[enemyKey];
    }
  }

  const pPrio = playerAbility.priority || 0;
  const ePrio = enemyAbility.priority || 0;
  const pSpd = effectiveStat(state.pf, 'spd');
  const eSpd = effectiveStat(state.ef, 'spd');
  let pFirst;
  if (pPrio !== ePrio) pFirst = pPrio > ePrio;
  else if (pSpd !== eSpd) pFirst = pSpd > eSpd;
  else {
    if (hasPassive(state.pf, 'featherweight')) pFirst = true;
    else if (hasPassive(state.ef, 'featherweight')) pFirst = false;
    else pFirst = Math.random() < 0.5;
  }

  const playerTurn = ['player', pReleasing, false, playerAbility];
  const enemyTurn  = ['enemy',  eReleasing, enemySwapping, enemyAbility];
  const order = pFirst ? [playerTurn, enemyTurn] : [enemyTurn, playerTurn];

  for (const [side, releasing, swapping, ability] of order) {
    if (state.pf.hp <= 0 || state.ef.hp <= 0) break;
    const attacker = side === 'player' ? state.pf : state.ef;
    const defender = side === 'player' ? state.ef : state.pf;
    tickStartOfTurn(attacker, side);
    if (attacker.hp <= 0) break;
    if (swapping) {
      applyCursedOnSwap(state.ef, 'enemy');
      if (state.ef.charging) {
        pushLog(`${displayName(state.ef.creature)}'s ${state.ef.chargeAbility.name} fizzles!`, 'eff');
        state.ef.charging = null;
        state.ef.chargeAbility = null;
      }
      pushLog(`${displayName(state.ef.creature)} swaps to its bench.`, 'eff');
      const out = state.ef;
      state.ef = state.ebf;
      state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
      sfx('select');
    } else if (releasing) {
      attacker.charging = null;
      attacker.chargeAbility = null;
      await releaseCharge(side, attacker, defender, ability);
    } else {
      await resolveAction(side, attacker, defender, ability);
    }
    render();
    await sleep(550);
  }

  if (state.bf && state.bf.hp > 0) tickFighterStatuses(state.bf, 'player', true);
  if (state.ebf && state.ebf.hp > 0) tickFighterStatuses(state.ebf, 'enemy', true);

  const cont = await handleFaintsIfAny();
  if (!cont) return;

  state.acting = false;
  render();
}

export async function resolveAction(side, attacker, defender, ability) {
  const oside = side === 'player' ? 'enemy' : 'player';
  if (ability.hpCost) {
    const cost = Math.round(attacker.creature.maxHp * ability.hpCost);
    attacker.hp = Math.max(1, attacker.hp - cost);
    spawnFloat(side, String(cost), 'dmg');
  }
  if (attacker.statuses && attacker.statuses.dazed && Math.random() < 0.5) {
    pushLog(`${displayName(attacker.creature)} is dazed and can't act!`, 'eff');
    return;
  }
  if (ability.kind === 'attack') {
    pushLog(`${displayName(attacker.creature)} uses ${ability.name}.`);
    playLunge(side);
    await sleep(180);
    const hits = ability.hits || 1;
    for (let h = 0; h < hits; h++) {
      if (defender.hp <= 0) break;
      const result = calculateDamage(attacker, defender, ability);
      if (result.evaded) {
        spawnFloat(oside, 'EVADE', 'heal');
        sfx('select');
        pushLog(`${displayName(defender.creature)} evades the attack!`, 'eff');
        continue;
      }
      defender.hp = Math.max(0, defender.hp - result.dmg);
      spawnFloat(oside, String(result.dmg), result.crit ? 'crit' : 'dmg');
      if (h === 0) {
        if (result.mult > 1) spawnCallout('SUPER EFFECTIVE');
        else if (result.mult < 1) spawnCallout('NOT VERY...');
      }
      if (result.crit) sfx('crit'); else sfx('hit');
      shakeStage(); playRecoil(oside);
      pushLog(`Deals ${result.dmg} damage${result.crit ? ' (CRIT)' : ''}.${result.mult > 1 ? ' Super effective!' : result.mult < 1 ? ' Not very effective.' : ''}`, result.crit ? 'crit' : (result.mult !== 1 ? 'eff' : ''));
      processPostHit(side, oside, attacker, defender, ability, result);
      resolveAbilityEffect(side, oside, attacker, defender, ability, result);
      if (h < hits - 1) await sleep(220);
    }
  } else if (ability.kind === 'defend') {
    attacker.bracingThisTurn = true;
    pushLog(`${displayName(attacker.creature)} braces.`);
    sfx('select');
  } else if (ability.kind === 'apply_heal') {
    if (ability.healPercent && ability.healTurns) {
      const perTurn = Math.max(1, Math.round(attacker.creature.maxHp * ability.healPercent));
      attacker.healing = { perTurn, turnsLeft: ability.healTurns };
      pushLog(`${displayName(attacker.creature)} begins healing (+${perTurn}/turn for ${ability.healTurns}).`);
    }
    resolveAbilityEffect(side, oside, attacker, defender, ability, { dmg: 0 });
    sfx('heal');
  } else if (ability.kind === 'buff') {
    for (const [k, v] of Object.entries(ability.statMult || {})) attacker.statMods[k] += v;
    resolveAbilityEffect(side, oside, attacker, defender, ability, { dmg: 0 });
    const hasCleanse = (ability.additionalEffects || []).includes('cleanse_self');
    if (!hasCleanse) pushLog(`${displayName(attacker.creature)} channels ${ability.name}.`);
    sfx(hasCleanse ? 'heal' : 'select');
  } else if (ability.kind === 'debuff') {
    pushLog(`${displayName(attacker.creature)} casts ${ability.name}.`);
    sfx('select');
    resolveAbilityEffect(side, oside, attacker, defender, ability, { dmg: 0 });
  } else if (ability.kind === 'charge_attack') {
    if (!attacker.charging) {
      attacker.charging = ability.key || ability;
      attacker.chargeAbility = ability;
      pushLog(`${displayName(attacker.creature)} is charging ${ability.name}!`, 'eff');
      sfx('select');
    } else {
      attacker.charging = null;
      attacker.chargeAbility = null;
      await releaseCharge(side, attacker, defender, ability);
    }
  } else if (ability.kind === 'swap_self') {
    const benchFighter = side === 'player' ? state.bf : state.ebf;
    if (!benchFighter || benchFighter.hp <= 0) {
      pushLog(`${displayName(attacker.creature)} tried to swap, but no ally is ready.`, 'eff');
      return;
    }
    applyCursedOnSwap(attacker, side);
    pushLog(`${displayName(attacker.creature)} swaps out via ${ability.name}.`, 'eff');
    sfx('select');
    if (side === 'player') {
      const out = state.pf;
      state.pf = state.bf;
      state.bf = out;
      state.activeIdx = 1 - state.activeIdx;
      state.pCharge = null;
    } else {
      const out = state.ef;
      state.ef = state.ebf;
      state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
      state.eCharge = null;
    }
    const incoming = benchFighter;
    if (ability.buffOnSwap) {
      for (const [k, v] of Object.entries(ability.buffOnSwap)) incoming.statMods[k] += v;
      pushLog(`${displayName(incoming.creature)} arrives bolstered.`, 'eff');
    }
    if (ability.healOnSwap) {
      const amt = Math.round(incoming.creature.maxHp * ability.healOnSwap);
      const healed = applyHeal(incoming, amt);
      if (healed > 0) {
        spawnFloat(side, `+${healed}`, 'heal');
        pushLog(`${displayName(incoming.creature)} arrives healed for ${healed}.`);
      }
    }
    applySwapInPassives(incoming, attacker, side, { applyHeal, cleanseStatuses, spawnFloat, pushLog, displayName });
    incoming.onBench = false;
    attacker.onBench = true;
  } else if (ability.kind === 'bench_support') {
    const benchFighter = side === 'player' ? state.bf : state.ebf;
    if (!benchFighter) {
      pushLog(`${displayName(attacker.creature)} casts ${ability.name}, but has no ally to support.`, 'eff');
      return;
    }
    pushLog(`${displayName(attacker.creature)} aids the bench with ${ability.name}.`, 'eff');
    sfx('heal');
    if (ability.effect === 'bench_bloom') {
      applyStatus(benchFighter, 'bloom', { turns: 4, pct: 0.06 });
    } else if (ability.effect === 'bench_buff_atk') {
      benchFighter.statMods.atk += 0.25;
    } else if (ability.effect === 'bench_buff_def') {
      benchFighter.statMods.def += 0.30;
    } else if (ability.effect === 'bench_cleanse') {
      cleanseStatuses(benchFighter);
    } else if (ability.effect === 'bench_heal') {
      const healed = applyHeal(benchFighter, Math.round(benchFighter.creature.maxHp * 0.30));
      if (healed > 0) pushLog(`${displayName(benchFighter.creature)} heals ${healed} on the bench.`);
    }
  }
}

export async function releaseCharge(side, attacker, defender, ability) {
  const oside = side === 'player' ? 'enemy' : 'player';
  pushLog(`${displayName(attacker.creature)} unleashes ${ability.name}!`, 'eff');
  playLunge(side);
  await sleep(220);
  if (ability.power && ability.power > 0) {
    const hits = ability.hits || 1;
    for (let h = 0; h < hits; h++) {
      if (defender.hp <= 0) break;
      const result = calculateDamage(attacker, defender, ability);
      if (result.evaded) {
        spawnFloat(oside, 'EVADE', 'heal');
        sfx('select');
        pushLog(`${displayName(defender.creature)} evades!`, 'eff');
        continue;
      }
      defender.hp = Math.max(0, defender.hp - result.dmg);
      spawnFloat(oside, String(result.dmg), result.crit ? 'crit' : 'dmg');
      if (result.crit) sfx('crit'); else sfx('hit');
      shakeStage(); playRecoil(oside);
      pushLog(`Deals ${result.dmg} damage${result.crit ? ' (CRIT)' : ''}.`, result.crit ? 'crit' : '');
      processPostHit(side, oside, attacker, defender, ability, result);
      resolveAbilityEffect(side, oside, attacker, defender, ability, result);
    }
  } else {
    resolveAbilityEffect(side, oside, attacker, defender, ability, { dmg: 0 });
  }
}

export function finishBattleIfDone() {
  if (state.wave === TOTAL_WAVES) {
    state.screen = 'victory';
    sfx('victory');
    render();
    return;
  }
  // XP based on sum of enemy levels — high-level kills pay big.
  const totalEnemyLevel = state.enemyParty.reduce((sum, e) => sum + e.level, 0);
  const xpGained = Math.round(totalEnemyLevel * 6 + 20);
  const xpReports = [];
  let anyLeveled = false;
  // Award XP to ALL party members AND ALL reserve creatures.
  const allCreatures = [...state.party, ...state.reserve];
  for (const c of allCreatures) {
    const events = gainXp(c, xpGained);
    if (events.length) anyLeveled = true;
    xpReports.push({ creature: c, levelEvents: events, isReserve: !state.party.includes(c) });
  }
  if (anyLeveled) sfx('levelup');
  state.postBattleEvents = {
    xpGained,
    xpReports,
    capturedChoices: [...state.enemyParty],
    capturedSelected: null,
  };
  state.screen = 'aftermath';
  for (const c of state.party) c.maxHp = c.stats.hp;
  render();
}
