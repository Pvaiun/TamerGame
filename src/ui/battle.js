import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, TYPE_CHART } from '../data.js';
import { state } from '../state.js';
import { displayName } from '../creature.js';
import { renderCreatureSvg } from '../art.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap } from '../combat/battle.js';
import { syncBattleScene } from '../stage/game.js';
import { applyHpFill } from './hpTween.js';

export function renderBattle() {
  const stage = el('div', { class: 'stage', id: 'stage' });
  app().appendChild(stage);

  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, `Wave ${state.wave} — battle`));

  const hud = el('div', { class: 'battle-hud' });
  hud.appendChild(actorHudEl(state.pf, 'player'));
  hud.appendChild(actorHudEl(state.ef, 'enemy'));
  panel.appendChild(hud);

  if (state.bf || state.ebf) {
    const benchRow = el('div', { class: 'bench-row' });
    benchRow.appendChild(benchCreatureEl(state.bf, 'player'));
    benchRow.appendChild(benchCreatureEl(state.ebf, 'enemy'));
    panel.appendChild(benchRow);
  }

  const grid = el('div', { class: 'ability-grid pokemon' });
  if (state.pf.queuedAbility) {
    const qk = state.pf.queuedAbility.key;
    const a = ABILITIES[qk];
    const phaseIdx = state.pf.queuedAbility.phaseIdx;
    const totalPhases = (a && a.phases ? a.phases.length : 1);
    const isLast = phaseIdx === totalPhases - 1;
    let cls = 'ability-btn pokemon-btn release-btn';
    if (a && a.element) cls += ' elem-' + a.element;
    if (a && a.element && abilityHasDamage(a)) {
      const m = TYPE_CHART[a.element][state.ef.creature.type];
      if (m > 1) cls += ' eff-good';
      else if (m < 1) cls += ' eff-bad';
    }
    const btn = el('button', { class: cls, style: 'grid-column: 1 / -1; min-height: 110px;' });
    btn.appendChild(el('div', { class: 'name', style: 'font-size: 14px; color: var(--text-faint); letter-spacing: 2px;' },
      isLast ? 'UNLEASH' : `CONTINUE (${phaseIdx + 1}/${totalPhases})`));
    btn.appendChild(el('div', { class: 'name', style: 'font-size: 18px; margin-top: 4px;' }, [
      a && a.element ? el('span', { class: 'type-pip ' + a.element }) : null,
      a ? a.name : '?',
    ].filter(Boolean)));
    const phasePower = phasePowerFor(a, phaseIdx);
    if (phasePower > 0) btn.appendChild(el('div', { class: 'dmg-value', style: 'font-size: 28px; margin-top: 4px;' }, String(phasePower)));
    if (state.acting) btn.disabled = true;
    attachLongPress(btn,
      () => openAbilityTooltip(qk),
      state.acting ? null : () => playerAct(null)
    );
    grid.appendChild(btn);
  } else {
    for (const k of state.pf.creature.abilities) {
      const a = ABILITIES[k];
      if (!a) continue;
      let cls = 'ability-btn pokemon-btn';
      let starTag = false;
      if (abilityHasDamage(a) && a.element) {
        const mult = TYPE_CHART[a.element][state.ef.creature.type];
        if (mult > 1) starTag = true;
      }
      if (a.element) cls += ' elem-' + a.element;
      const btn = el('button', { class: cls });
      btn.appendChild(el('div', { class: 'name' }, [
        a.element ? el('span', { class: 'type-pip ' + a.element }) : null,
        a.name,
      ].filter(Boolean)));
      btn.appendChild(abilityFlavorChip(a));
      if (starTag) btn.appendChild(el('div', { class: 'eff-star' }, '★'));
      if (state.acting) btn.disabled = true;
      attachLongPress(btn,
        () => openAbilityTooltip(k),
        state.acting ? null : () => playerAct(k)
      );
      grid.appendChild(btn);
    }
  }
  panel.appendChild(grid);

  const canSwap = state.bf && state.bf.hp > 0 && !state.acting;
  const swapBtn = el('button', { class: 'swap-btn' + (canSwap ? '' : ' disabled') });
  swapBtn.appendChild(el('span', { class: 'swap-icon' }, '⇄'));
  swapBtn.appendChild(el('span', {}, state.bf
    ? `Swap to ${displayName(state.bf.creature)}`
    : 'No bench available'));
  if (canSwap) {
    swapBtn.addEventListener('click', () => playerSwap());
  } else {
    swapBtn.disabled = true;
  }
  panel.appendChild(swapBtn);

  panel.appendChild(el('div', { style: 'text-align: center; font-size: 10px; color: var(--text-faint); margin-top: 6px; letter-spacing: 1px;' }, 'TAP TO USE · LONG-PRESS FOR DETAILS'));

  const logEl = el('div', { class: 'battle-log' });
  for (const entry of state.log.slice(-6)) {
    logEl.appendChild(el('div', { class: 'log-line ' + entry.cls }, entry.msg));
  }
  panel.appendChild(logEl);

  app().appendChild(panel);

  syncBattleScene({ pf: state.pf, ef: state.ef, bf: state.bf, ebf: state.ebf });
}

function benchCreatureEl(f, side) {
  const wrap = el('div', { class: 'bench-slot ' + side });
  if (!f) {
    wrap.appendChild(el('div', { class: 'bench-empty' }, '— no bench —'));
    return wrap;
  }
  const portrait = el('div', { class: 'bench-portrait' });
  portrait.innerHTML = side === 'enemy'
    ? `<div style="transform: scaleX(-1);">${renderCreatureSvg(f.creature)}</div>`
    : renderCreatureSvg(f.creature);
  wrap.appendChild(portrait);
  const info = el('div', { class: 'bench-info' });
  const nameRow = el('div', { class: 'bench-name-row' });
  nameRow.appendChild(el('span', { class: 'type-pip ' + f.creature.type }));
  nameRow.appendChild(el('span', { class: 'bench-name' }, displayName(f.creature)));
  nameRow.appendChild(el('span', { class: 'bench-level' }, `L${f.creature.level}`));
  info.appendChild(nameRow);
  const hpPct = Math.max(0, f.hp / f.creature.maxHp);
  info.appendChild(el('div', { class: 'bench-hp-text' }, `${Math.max(0, f.hp)} / ${f.creature.maxHp}`));
  const bar = el('div', { class: 'bench-hp' });
  const fill = el('div', { class: 'bench-hp-fill' });
  if (hpPct < 0.25) fill.style.background = '#cc5555';
  else if (hpPct < 0.5) fill.style.background = '#cc9955';
  else fill.style.background = '#66cc66';
  bar.appendChild(fill);
  applyHpFill(fill, f);
  info.appendChild(bar);
  const status = el('div', { class: 'bench-status' });
  if (f.statuses) {
    if (f.statuses.burn) status.appendChild(el('span', { class: 'status-chip burn' }, `BURN ${f.statuses.burn.turns}`));
    if (f.statuses.bloom) status.appendChild(el('span', { class: 'status-chip heal' }, `BLOOM ${f.statuses.bloom.turns}`));
    if (f.statuses.soaking) status.appendChild(el('span', { class: 'status-chip slow' }, `SOAKED ${f.statuses.soaking.turns}`));
    if (f.statuses.cursed) status.appendChild(el('span', { class: 'status-chip debuff' }, 'CURSED'));
    if (f.statuses.dazed) status.appendChild(el('span', { class: 'status-chip slow' }, `DAZED ${f.statuses.dazed.turns}`));
  }
  if (status.children.length) info.appendChild(status);
  wrap.appendChild(info);
  attachLongPress(wrap, () => openInspectModal(f.creature), null);
  return wrap;
}

function actorHudEl(f, side) {
  const wrap = el('div', { class: 'actor-hud inspectable' });
  const head = el('div', { class: 'actor-hud-name' });
  head.appendChild(el('span', {}, [
    el('span', { class: 'type-pip ' + f.creature.type }),
    el('span', {}, displayName(f.creature)),
  ]));
  head.appendChild(el('span', { class: 'type-' + f.creature.type, style: 'font-size: 10px; letter-spacing: 2px;' }, f.creature.type.toUpperCase()));
  wrap.appendChild(head);

  wrap.appendChild(el('div', { class: 'hp-line' }, `HP ${Math.max(0, f.hp)} / ${f.creature.maxHp}`));
  const hpBar = el('div', { class: 'hp-bar' });
  const pct = Math.max(0, f.hp / f.creature.maxHp);
  let cls = 'hp-fill';
  if (pct < 0.25) cls += ' critical';
  else if (pct < 0.5) cls += ' low';
  const fill = el('div', { class: cls });
  hpBar.appendChild(fill);
  applyHpFill(fill, f);
  wrap.appendChild(hpBar);
  attachLongPress(wrap, () => openInspectModal(f.creature), null);

  const status = el('div', { class: 'status-row' });
  if (f.healing && f.healing.turnsLeft > 0) {
    status.appendChild(el('span', { class: 'status-chip heal' }, `HEAL ${f.healing.turnsLeft}`));
  }
  if (f.statuses && f.statuses.burn) status.appendChild(el('span', { class: 'status-chip burn' }, `BURN ${f.statuses.burn.turns}`));
  if (f.statuses && f.statuses.bloom) status.appendChild(el('span', { class: 'status-chip heal' }, `BLOOM ${f.statuses.bloom.turns}`));
  if (f.statuses && f.statuses.soaking) status.appendChild(el('span', { class: 'status-chip slow' }, `SOAKED ${f.statuses.soaking.turns}`));
  if (f.statuses && f.statuses.cursed) status.appendChild(el('span', { class: 'status-chip debuff' }, `CURSED ${f.statuses.cursed.turns}`));
  if (f.statuses && f.statuses.dazed) status.appendChild(el('span', { class: 'status-chip slow' }, `DAZED ${f.statuses.dazed.turns}`));
  const pctFmt = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const positives = [];
  const negatives = [];
  if (f.statMods.atk > 0.01) positives.push(`ATK ${pctFmt(f.statMods.atk)}`);
  if (f.statMods.def > 0.01) positives.push(`DEF ${pctFmt(f.statMods.def)}`);
  if (f.statMods.spd > 0.01) positives.push(`SPD ${pctFmt(f.statMods.spd)}`);
  if (f.statMods.atk < -0.01) negatives.push(`ATK ${pctFmt(f.statMods.atk)}`);
  if (f.statMods.def < -0.01) negatives.push(`DEF ${pctFmt(f.statMods.def)}`);
  if (f.statMods.spd < -0.01) negatives.push(`SPD ${pctFmt(f.statMods.spd)}`);
  if (positives.length) status.appendChild(el('span', { class: 'status-chip buff' }, positives.join(' ')));
  if (negatives.length) status.appendChild(el('span', { class: 'status-chip debuff' }, negatives.join(' ')));
  if (status.children.length) wrap.appendChild(status);

  return wrap;
}

// ─── Helpers: classify an ability by its effects for the move-button label ───

function abilityFlatEffects(a) {
  return (a && a.phases ? a.phases : []).flat();
}

function abilityHasDamage(a) {
  return abilityFlatEffects(a).some(e => e.type === 'damage');
}

// Total power × hits for damage effects in the FIRST phase (button label).
function phasePowerFor(a, phaseIdx) {
  const phase = (a && a.phases) ? (a.phases[phaseIdx] || []) : [];
  let total = 0;
  for (const e of phase) {
    if (e.type === 'damage') total += (e.power || 0) * (e.hits || 1);
  }
  return total;
}

function abilityFlavorChip(a) {
  const phase0 = (a.phases && a.phases[0]) || [];
  const dmg = phase0.filter(e => e.type === 'damage');
  if (dmg.length > 0) {
    const power = dmg.reduce((s, e) => s + (e.power || 0), 0);
    const hits = dmg.reduce((s, e) => s + (e.hits || 1), 0);
    const label = hits > 1 ? `${power} × ${hits}` : `${power}`;
    return el('div', { class: 'dmg-value' }, label);
  }
  if (a.phases && a.phases.length > 1) {
    return el('div', { class: 'dmg-value subtle' }, 'CHARGE');
  }
  const flat = abilityFlatEffects(a);
  if (flat.some(e => e.type === 'heal_over_time')) return el('div', { class: 'dmg-value subtle heal' }, 'HEAL');
  if (flat.some(e => e.type === 'swap'))           return el('div', { class: 'dmg-value subtle' }, 'SWAP');
  if (flat.some(e => e.type === 'buff'))           return el('div', { class: 'dmg-value subtle' }, 'BUFF');
  if (flat.some(e => e.type === 'apply_status'))   return el('div', { class: 'dmg-value subtle' }, 'STATUS');
  if (flat.some(e => e.type === 'cleanse'))        return el('div', { class: 'dmg-value subtle heal' }, 'CLEANSE');
  if (flat.some(e => e.type === 'bracing'))        return el('div', { class: 'dmg-value subtle' }, 'BRACE');
  return el('div', { class: 'dmg-value subtle' }, '—');
}
