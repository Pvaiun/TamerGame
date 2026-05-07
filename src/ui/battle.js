import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, TYPE_CHART } from '../data.js';
import { state } from '../state.js';
import { displayName } from '../creature.js';
import { renderCreatureSvg } from '../art.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap } from '../combat/battle.js';

export function renderBattle() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, `Wave ${state.wave} — battle`));

  const stage = el('div', { class: 'stage', id: 'stage' });
  if (state.bf && state.bf.hp > 0) {
    const pBench = el('div', { class: 'stage-bench player' });
    pBench.innerHTML = renderCreatureSvg(state.bf.creature);
    stage.appendChild(pBench);
  }
  const pActor = el('div', { class: 'stage-actor player idle' });
  pActor.id = 'p-actor';
  pActor.innerHTML = renderCreatureSvg(state.pf.creature);
  stage.appendChild(pActor);
  const eActor = el('div', { class: 'stage-actor enemy idle' });
  eActor.id = 'e-actor';
  const eSvg = renderCreatureSvg(state.ef.creature);
  eActor.innerHTML = `<div style="transform: scaleX(-1);">${eSvg}</div>`;
  stage.appendChild(eActor);
  if (state.ebf && state.ebf.hp > 0) {
    const eBench = el('div', { class: 'stage-bench enemy' });
    eBench.innerHTML = `<div style="transform: scaleX(-1);">${renderCreatureSvg(state.ebf.creature)}</div>`;
    stage.appendChild(eBench);
  }
  panel.appendChild(stage);

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
  if (state.pf.charging) {
    const a = state.pf.chargeAbility;
    let cls = 'ability-btn pokemon-btn release-btn';
    if (a.element) cls += ' elem-' + a.element;
    if ((a.kind === 'attack' || a.kind === 'charge_attack') && a.element) {
      const m = TYPE_CHART[a.element][state.ef.creature.type];
      if (m > 1) cls += ' eff-good';
      else if (m < 1) cls += ' eff-bad';
    }
    const btn = el('button', { class: cls, style: 'grid-column: 1 / -1; min-height: 110px;' });
    btn.appendChild(el('div', { class: 'name', style: 'font-size: 14px; color: var(--text-faint); letter-spacing: 2px;' }, 'RELEASE'));
    btn.appendChild(el('div', { class: 'name', style: 'font-size: 18px; margin-top: 4px;' }, [
      a.element ? el('span', { class: 'type-pip ' + a.element }) : null,
      a.name,
    ].filter(Boolean)));
    if (a.power && a.power > 0) btn.appendChild(el('div', { class: 'dmg-value', style: 'font-size: 28px; margin-top: 4px;' }, String(a.power)));
    if (state.acting) btn.disabled = true;
    attachLongPress(btn,
      () => openAbilityTooltip(Object.keys(ABILITIES).find(k => ABILITIES[k] === a) || ''),
      state.acting ? null : () => playerAct(null)
    );
    grid.appendChild(btn);
  } else {
    for (const k of state.pf.creature.abilities) {
      const a = ABILITIES[k];
      if (!a) continue;
      let cls = 'ability-btn pokemon-btn';
      let starTag = false;
      if ((a.kind === 'attack' || a.kind === 'charge_attack') && a.element) {
        const mult = TYPE_CHART[a.element][state.ef.creature.type];
        if (mult > 1) starTag = true;
      }
      if (a.element) cls += ' elem-' + a.element;
      const btn = el('button', { class: cls });
      btn.appendChild(el('div', { class: 'name' }, [
        a.element ? el('span', { class: 'type-pip ' + a.element }) : null,
        a.name,
      ].filter(Boolean)));
      if (a.power && a.power > 0) {
        const hits = a.hits || 1;
        const label = hits > 1 ? `${a.power} × ${hits}` : `${a.power}`;
        btn.appendChild(el('div', { class: 'dmg-value' }, label));
      } else if (a.kind === 'apply_heal') {
        btn.appendChild(el('div', { class: 'dmg-value subtle heal' }, 'HEAL'));
      } else if (a.kind === 'buff') {
        btn.appendChild(el('div', { class: 'dmg-value subtle' }, 'BUFF'));
      } else if (a.kind === 'debuff') {
        btn.appendChild(el('div', { class: 'dmg-value subtle' }, 'STATUS'));
      } else if (a.kind === 'swap_self') {
        btn.appendChild(el('div', { class: 'dmg-value subtle' }, 'SWAP'));
      } else if (a.kind === 'bench_support') {
        btn.appendChild(el('div', { class: 'dmg-value subtle heal' }, 'BENCH'));
      } else if (a.kind === 'charge_attack' && !a.power) {
        btn.appendChild(el('div', { class: 'dmg-value subtle' }, 'CHARGE'));
      }
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
  fill.style.width = `${Math.round(hpPct * 100)}%`;
  if (hpPct < 0.25) fill.style.background = '#cc5555';
  else if (hpPct < 0.5) fill.style.background = '#cc9955';
  else fill.style.background = '#66cc66';
  bar.appendChild(fill);
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
  hpBar.appendChild(el('div', { class: cls, style: `width:${pct * 100}%;` }));
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
