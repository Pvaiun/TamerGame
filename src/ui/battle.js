// Dossier-aesthetic battle screen. The player and enemy each get a column
// laid out as redacted field-document pages. The bottom box is dual-state:
// it shows the action menu when the player must choose, and a narrative log
// during turn resolution.

import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, PASSIVES, TYPE_CHART } from '../data.js';
import { state, TOTAL_WAVES } from '../state.js';
import { displayName } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap } from '../combat/battle.js';
import { applyHpFill } from './hpTween.js';

export function renderBattle() {
  const screen = el('div', { class: 'dossier-screen' });
  screen.appendChild(engagementStripEl());
  screen.appendChild(benchRowEl());

  const grid = el('div', { class: 'dossier-grid' });
  grid.appendChild(dossierColEl(state.pf, 'player'));
  grid.appendChild(el('div', { class: 'dossier-divider' }));
  grid.appendChild(dossierColEl(state.ef, 'enemy'));
  screen.appendChild(grid);

  screen.appendChild(actionBoxEl());

  app().appendChild(screen);
}

// ── engagement strip ─────────────────────────────────────────────────
function engagementStripEl() {
  return el('div', { class: 'engagement-strip' }, [
    engCell('FILE',  `BL-${String(state.wave).padStart(3, '0')}/W`),
    engCell('WAVE',  `${state.wave} / ${TOTAL_WAVES}`),
    engCell('PARTY', String(state.party.length)),
    engCell('PHASE', state.acting ? 'RESOLVING' : 'AWAITING'),
  ]);
}
function engCell(label, val) {
  return el('div', { class: 'eng-cell' }, [
    el('div', { class: 'eng-label' }, label),
    el('div', { class: 'eng-val' }, val),
  ]);
}

// ── bench row ────────────────────────────────────────────────────────
function benchRowEl() {
  const row = el('div', { class: 'bench-row-doc' });
  row.appendChild(benchCardEl(state.bf, 'player'));
  row.appendChild(benchCardEl(state.ebf, 'enemy'));
  return row;
}

function benchCardEl(f, side) {
  const card = el('div', { class: 'bench-doc ' + side });
  if (!f) {
    card.appendChild(el('div', { class: 'bench-empty-doc' },
      side === 'player' ? '— RESERVE EMPTY —' : '— SOLITARY —'));
    return card;
  }
  const c = f.creature;
  const portrait = el('div', { class: 'bench-glyph' });
  portrait.innerHTML = renderGlyph(c.species);
  card.appendChild(portrait);

  const info = el('div', { class: 'bench-info-doc' });
  info.appendChild(el('div', { class: 'bench-name-doc' }, displayName(c).toUpperCase()));
  info.appendChild(el('div', { class: 'bench-meta-doc' }, [
    el('span', { class: 'doc-type type-' + c.type }, c.type.toUpperCase()),
    el('span', { class: 'sep' }, ' / '),
    el('span', {}, `LV${c.level}`),
    el('span', { class: 'sep' }, ' / '),
    el('span', {}, `${Math.max(0, f.hp)}/${c.maxHp}`),
  ]));
  const bar = el('div', { class: 'bench-bar' });
  const fill = el('div', { class: 'bench-bar-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);
  info.appendChild(bar);
  card.appendChild(info);
  attachLongPress(card, () => openInspectModal(c), null);
  return card;
}

// ── dossier column ───────────────────────────────────────────────────
function dossierColEl(f, side) {
  const c = f.creature;
  const col = el('div', { class: `dossier-col ${side}` });

  // 1. Classification strip
  const cls = el('div', { class: 'dossier-class' });
  cls.appendChild(el('div', { class: 'class-prefix' },
    side === 'player' ? 'SUBJECT — BOUND' : 'TARGET — HOSTILE'));
  cls.appendChild(el('div', { class: 'class-name' }, displayName(c).toUpperCase()));
  cls.appendChild(el('div', { class: 'class-meta' }, [
    el('span', { class: 'doc-type type-' + c.type }, c.type.toUpperCase()),
    el('span', { class: 'sep' }, ' · '),
    el('span', {}, `LV ${c.level}`),
    el('span', { class: 'sep' }, ' · '),
    el('span', { class: 'class-id' }, `#${String(c.id).padStart(4, '0')}`),
  ]));
  col.appendChild(cls);

  // 2. Glyph portrait
  const portrait = el('div', { class: 'glyph-portrait' });
  portrait.innerHTML = renderGlyph(c.species);
  attachLongPress(portrait, () => openInspectModal(c), null);
  col.appendChild(portrait);

  // 3. Vitals
  col.appendChild(vitalsEl(f));

  // 4. Stat block
  col.appendChild(statBlockEl(f));

  // 5. Behavioral / passives
  col.appendChild(passivesEl(c));

  // 6. Ability roster (textual reference for both sides)
  col.appendChild(abilityRosterEl(c, f, side));

  // 7. Status footer
  col.appendChild(statusFooterEl(f));

  return col;
}

function vitalsEl(f) {
  const wrap = el('div', { class: 'dossier-vitals' });
  wrap.appendChild(el('div', { class: 'sec-label' }, 'VITALS'));
  const numWrap = el('div', { class: 'vitals-num-row' });
  numWrap.appendChild(el('span', { class: 'vitals-num' }, String(Math.max(0, f.hp))));
  numWrap.appendChild(el('span', { class: 'vitals-slash' }, ' / '));
  numWrap.appendChild(el('span', { class: 'vitals-max' }, String(f.creature.maxHp)));
  wrap.appendChild(numWrap);
  const bar = el('div', { class: 'vitals-bar' });
  const fill = el('div', { class: 'vitals-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);
  wrap.appendChild(bar);
  return wrap;
}

function statBlockEl(f) {
  const block = el('div', { class: 'stat-block' });
  block.appendChild(el('div', { class: 'sec-label' }, 'CAPABILITY'));
  const stats = f.creature.stats;
  const mods = f.statMods || { atk: 0, def: 0, spd: 0 };
  for (const [key, label] of [['atk', 'ATK'], ['def', 'DEF'], ['spd', 'SPD']]) {
    const row = el('div', { class: 'stat-row-doc' });
    row.appendChild(el('div', { class: 'stat-key' }, label));
    row.appendChild(el('div', { class: 'stat-num' }, String(stats[key])));
    const m = mods[key] || 0;
    if (Math.abs(m) > 0.01) {
      const cls = m > 0 ? 'stat-mod-pos' : 'stat-mod-neg';
      const sign = m > 0 ? '+' : '';
      row.appendChild(el('div', { class: 'stat-mod-doc ' + cls },
        `${sign}${Math.round(m * 100)}%`));
    } else {
      row.appendChild(el('div', { class: 'stat-mod-doc' }, '·'));
    }
    block.appendChild(row);
  }
  return block;
}

function passivesEl(c) {
  const wrap = el('div', { class: 'dossier-passives' });
  wrap.appendChild(el('div', { class: 'sec-label' }, 'BEHAVIORAL'));
  const list = (c.passives && c.passives.length) ? c.passives : [];
  if (list.length === 0) {
    wrap.appendChild(el('div', { class: 'passive-line-doc empty' }, '— NONE OBSERVED —'));
  } else {
    list.forEach((key, i) => {
      const p = PASSIVES[key];
      const row = el('div', { class: 'passive-line-doc' });
      row.appendChild(el('span', { class: 'passive-num' }, `${i === 0 ? 'I' : 'II'}.`));
      row.appendChild(el('span', { class: 'passive-name' }, p ? p.name.toUpperCase() : key.toUpperCase()));
      wrap.appendChild(row);
    });
  }
  return wrap;
}

function abilityRosterEl(c, f, side) {
  const wrap = el('div', { class: 'dossier-abilities' });
  wrap.appendChild(el('div', { class: 'sec-label' }, 'CATALOGED ACTIONS'));
  const opp = side === 'player' ? state.ef : state.pf;
  for (const k of c.abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    const row = el('div', { class: 'ability-line-doc' });
    if (a.element) row.appendChild(el('span', { class: 'doc-type-pip ' + a.element }));
    row.appendChild(el('span', { class: 'ability-name-doc' }, a.name.toUpperCase()));
    const power = phasePowerFor(a, 0);
    const tail = el('span', { class: 'ability-tail' });
    if (power > 0) {
      tail.appendChild(el('span', { class: 'pow-num' }, String(power)));
      if (a.element && opp && opp.creature) {
        const m = TYPE_CHART[a.element]?.[opp.creature.type];
        if (m > 1) tail.appendChild(el('span', { class: 'eff-mark good' }, '+'));
        else if (m < 1) tail.appendChild(el('span', { class: 'eff-mark bad' }, '−'));
      }
    } else if (a.phases && a.phases.length > 1) {
      tail.appendChild(el('span', { class: 'pow-tag' }, `[${a.phases.length}P]`));
    } else {
      tail.appendChild(el('span', { class: 'pow-tag' }, abilityKindTag(a)));
    }
    row.appendChild(tail);
    wrap.appendChild(row);
  }
  return wrap;
}

function statusFooterEl(f) {
  const wrap = el('div', { class: 'dossier-status' });
  wrap.appendChild(el('div', { class: 'sec-label' }, 'CONDITION LOG'));
  const items = [];
  const s = f.statuses || {};
  if (s.burn)    items.push(['BURN',   `${s.burn.turns}T`,   'burn']);
  if (s.bloom)   items.push(['BLOOM',  `${s.bloom.turns}T`,  'heal']);
  if (s.soaking) items.push(['SOAKED', `${s.soaking.turns}T`, 'slow']);
  if (s.cursed)  items.push(['CURSED', `${s.cursed.turns}T`, 'debuff']);
  if (s.dazed)   items.push(['DAZED',  `${s.dazed.turns}T`,  'slow']);
  if (f.healing && f.healing.turnsLeft > 0) items.push(['HEALING', `${f.healing.turnsLeft}T`, 'heal']);
  if (items.length === 0) {
    wrap.appendChild(el('div', { class: 'cond-row empty' }, '— NOMINAL —'));
  } else {
    for (const [name, val, cls] of items) {
      const row = el('div', { class: 'cond-row ' + cls });
      row.appendChild(el('span', { class: 'cond-name' }, name));
      row.appendChild(el('span', { class: 'cond-val' }, val));
      wrap.appendChild(row);
    }
  }
  return wrap;
}

// ── action box (dual-state) ──────────────────────────────────────────
function actionBoxEl() {
  const box = el('div', { class: 'action-box' });
  if (state.acting) {
    box.classList.add('state-narrative');
    box.appendChild(narrativeEl());
  } else {
    box.classList.add('state-action');
    box.appendChild(actionMenuEl());
  }
  return box;
}

function narrativeEl() {
  const wrap = el('div', { class: 'narrative' });
  wrap.appendChild(el('div', { class: 'sec-label state-label' }, 'INCIDENT NOTES'));
  const lines = state.log.slice(-6);
  if (lines.length === 0) {
    wrap.appendChild(el('div', { class: 'narr-line empty' }, '— silence —'));
  } else {
    for (const entry of lines) {
      wrap.appendChild(el('div', { class: 'narr-line ' + (entry.cls || '') }, entry.msg));
    }
  }
  return wrap;
}

function actionMenuEl() {
  const wrap = el('div', { class: 'action-menu' });
  wrap.appendChild(el('div', { class: 'sec-label state-label' }, 'BLOODKEEPER DIRECTIVE'));

  if (state.pf.queuedAbility) {
    wrap.appendChild(queuedAbilityBtn());
  } else {
    const grid = el('div', { class: 'ability-grid-doc' });
    for (const k of state.pf.creature.abilities) {
      const a = ABILITIES[k];
      if (!a) continue;
      grid.appendChild(abilityBtnEl(k, a));
    }
    wrap.appendChild(grid);
  }

  const canSwap = state.bf && state.bf.hp > 0 && !state.acting;
  const swap = el('button', { class: 'swap-btn-doc' + (canSwap ? '' : ' disabled') });
  swap.appendChild(el('span', { class: 'swap-arrow' }, '⇄'));
  swap.appendChild(el('span', { class: 'swap-text' },
    state.bf ? `RELIEVE — ${displayName(state.bf.creature).toUpperCase()}` : 'NO RELIEF AVAILABLE'));
  if (canSwap) {
    swap.addEventListener('click', () => playerSwap());
  } else {
    swap.disabled = true;
  }
  wrap.appendChild(swap);

  wrap.appendChild(el('div', { class: 'menu-hint' }, 'TAP — COMMIT  ·  HOLD — DETAIL'));
  return wrap;
}

function abilityBtnEl(k, a) {
  let cls = 'doc-ability-btn';
  if (a.element) cls += ' elem-' + a.element;
  if (a.element && abilityHasDamage(a)) {
    const mult = TYPE_CHART[a.element]?.[state.ef.creature.type];
    if (mult > 1) cls += ' is-effective';
    else if (mult < 1) cls += ' is-resisted';
  }
  const btn = el('button', { class: cls });
  if (state.acting) btn.disabled = true;

  const top = el('div', { class: 'btn-top' });
  if (a.element) top.appendChild(el('span', { class: 'doc-type-pip ' + a.element }));
  top.appendChild(el('span', { class: 'btn-name' }, a.name.toUpperCase()));
  btn.appendChild(top);

  const bot = el('div', { class: 'btn-bot' });
  const power = phasePowerFor(a, 0);
  if (power > 0) {
    const dmg = abilityDamageEffect(a);
    const hits = (dmg && dmg.hits) || 1;
    const label = hits > 1 ? `${dmg.power}×${hits}` : String(power);
    bot.appendChild(el('span', { class: 'btn-pow' }, label));
  } else if (a.phases && a.phases.length > 1) {
    bot.appendChild(el('span', { class: 'btn-tag' }, `${a.phases.length}-PHASE`));
  } else {
    bot.appendChild(el('span', { class: 'btn-tag' }, abilityKindTag(a)));
  }
  if (cls.includes('is-effective')) bot.appendChild(el('span', { class: 'btn-eff good' }, 'EFFECTIVE'));
  else if (cls.includes('is-resisted')) bot.appendChild(el('span', { class: 'btn-eff bad' }, 'RESISTED'));
  btn.appendChild(bot);

  attachLongPress(btn,
    () => openAbilityTooltip(k),
    state.acting ? null : () => playerAct(k));
  return btn;
}

function queuedAbilityBtn() {
  const q = state.pf.queuedAbility;
  const a = ABILITIES[q.key];
  const total = (a && a.phases ? a.phases.length : 1);
  const isLast = q.phaseIdx === total - 1;
  let cls = 'doc-ability-btn queued';
  if (a && a.element) cls += ' elem-' + a.element;
  const btn = el('button', { class: cls });
  if (state.acting) btn.disabled = true;

  const top = el('div', { class: 'btn-top' });
  top.appendChild(el('span', { class: 'btn-queued-prefix' },
    isLast ? 'UNLEASH —' : `CONTINUE (${q.phaseIdx + 1}/${total}) —`));
  if (a && a.element) top.appendChild(el('span', { class: 'doc-type-pip ' + a.element }));
  top.appendChild(el('span', { class: 'btn-name' }, (a ? a.name : '?').toUpperCase()));
  btn.appendChild(top);

  const bot = el('div', { class: 'btn-bot' });
  const power = phasePowerFor(a, q.phaseIdx);
  if (power > 0) bot.appendChild(el('span', { class: 'btn-pow' }, String(power)));
  btn.appendChild(bot);

  attachLongPress(btn,
    () => openAbilityTooltip(q.key),
    state.acting ? null : () => playerAct(null));
  return btn;
}

// ── helpers ──────────────────────────────────────────────────────────
function abilityFlatEffects(a) {
  return (a && a.phases ? a.phases : []).flat();
}
function abilityHasDamage(a) {
  return abilityFlatEffects(a).some(e => e.type === 'damage');
}
function abilityDamageEffect(a) {
  const phase0 = (a.phases && a.phases[0]) || [];
  return phase0.find(e => e.type === 'damage');
}
function phasePowerFor(a, phaseIdx) {
  const phase = (a && a.phases) ? (a.phases[phaseIdx] || []) : [];
  let total = 0;
  for (const e of phase) if (e.type === 'damage') total += (e.power || 0) * (e.hits || 1);
  return total;
}
function abilityKindTag(a) {
  const flat = abilityFlatEffects(a);
  if (flat.some(e => e.type === 'heal_over_time')) return 'HEAL';
  if (flat.some(e => e.type === 'swap'))           return 'SWAP';
  if (flat.some(e => e.type === 'buff'))           return 'BUFF';
  if (flat.some(e => e.type === 'apply_status'))   return 'STATUS';
  if (flat.some(e => e.type === 'cleanse'))        return 'CLEANSE';
  if (flat.some(e => e.type === 'bracing'))        return 'BRACE';
  return '·';
}
