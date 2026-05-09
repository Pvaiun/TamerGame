// Dossier battle screen. The screen is a single document: the engagement
// strip at the top, two columns of dossier mid-page (each with the bench
// creature pinned at the top), a bottom box that flips between action menu
// and narrative state.
//
// Alignment rule: all prose is left-aligned in both columns. Only the stat
// hardware (hp bar, stat bars, their labels & numbers) is mirrored on the
// enemy side. The enemy's hp values are redacted; only the bar fill reads.

import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, PASSIVES, TYPE_CHART, VOICE } from '../data.js';
import { state, TOTAL_WAVES } from '../state.js';
import { displayName } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap } from '../combat/battle.js';
import { applyHpFill } from './hpTween.js';
import { parseProse } from './textCorrupt.js';

const STAT_BAR_MAX = 100;

export function renderBattle() {
  const screen = el('div', { class: 'dossier-screen' });
  screen.appendChild(engagementStripEl());

  const grid = el('div', { class: 'dossier-grid' });
  grid.appendChild(dossierColEl(state.pf, state.bf, 'player'));
  grid.appendChild(el('div', { class: 'dossier-divider' }));
  grid.appendChild(dossierColEl(state.ef, state.ebf, 'enemy'));
  screen.appendChild(grid);

  screen.appendChild(actionBoxEl());

  app().appendChild(screen);
}

// ── header ───────────────────────────────────────────────────────────
function engagementStripEl() {
  const left = el('div', { class: 'eng-left' });
  left.appendChild(el('span', {}, '// engagement'));
  left.appendChild(el('span', { class: 'eng-sep' }, ' · '));
  left.appendChild(el('span', {}, `depth ${roman(state.wave)}`));
  left.appendChild(el('span', { class: 'eng-sep' }, ' · '));
  left.appendChild(el('span', {}, `wave ${pad2(state.wave)} of ${pad2(TOTAL_WAVES)}`));

  const right = el('div', { class: 'eng-right' }, [
    el('span', { class: 'doc-blot' }, '●'),
    ' hostile',
  ]);

  return el('div', { class: 'engagement-strip' }, [left, right]);
}

// ── one column ───────────────────────────────────────────────────────
function dossierColEl(active, bench, side) {
  const col = el('div', { class: `dossier-col ${side}` });

  // bench sticker (top of column)
  col.appendChild(benchInlineEl(bench, side));

  // 1. name (large)
  const c = active.creature;
  const titleName = displayName(c).toLowerCase();
  col.appendChild(el('div', { class: 'doc-title' }, titleName));

  // 2. subtitle (one line of voice prose)
  col.appendChild(subtitleEl(c));

  // 3+4. glyph + field notes (glyph inline left for player, right for enemy)
  col.appendChild(fieldNotesEl(c, side));

  // 5. hp row
  col.appendChild(hpRowEl(active, side));

  // 6. stat block
  col.appendChild(statBlockEl(active, side));

  // 7. afflictions
  col.appendChild(afflictionsEl(active));

  // 8. passives
  col.appendChild(passivesEl(c));

  return col;
}

function benchInlineEl(f, side) {
  const wrap = el('div', { class: 'bench-inline ' + side });
  if (!f) {
    wrap.appendChild(el('span', { class: 'bench-empty-inline' },
      side === 'player' ? '— no companion benched —' : '— solitary —'));
    return wrap;
  }
  const c = f.creature;
  const g = el('span', { class: 'bench-glyph-inline' });
  g.innerHTML = renderGlyph(c.species);
  const name = displayName(c).toLowerCase();
  const composure = composureWord(f);
  const hpPct = Math.max(0, f.hp / c.maxHp);

  const text = el('span', { class: 'bench-text' });
  text.appendChild(el('span', { class: 'bench-name-inline' }, name));
  text.appendChild(el('span', { class: 'bench-sep' }, ' · '));
  text.appendChild(el('span', { class: 'bench-tag' }, 'benched'));

  const bar = el('span', { class: 'bench-bar-inline' });
  const fill = el('span', { class: 'bench-bar-inline-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);

  const hp = el('span', { class: 'bench-hp-inline' });
  if (side === 'player') {
    hp.appendChild(el('span', { class: 'bench-hp-num' }, `hp ${Math.max(0, f.hp)}`));
  } else {
    hp.appendChild(el('span', { class: 'redact', style: 'width:3ch' }, ' '));
    hp.appendChild(el('span', { class: 'bench-hp-num' }, ' hp'));
  }

  const status = el('span', { class: 'bench-composure' }, composure);

  wrap.appendChild(g);
  wrap.appendChild(text);
  wrap.appendChild(bar);
  wrap.appendChild(hp);
  wrap.appendChild(status);
  attachLongPress(wrap, () => openInspectModal(c), null);
  return wrap;
}

function subtitleEl(c) {
  const key = VOICE.subtitles[c.species] || VOICE.subtitles[c.type] || '—';
  const e = el('div', { class: 'doc-subtitle' });
  e.innerHTML = parseProse(key);
  return e;
}

function fieldNotesEl(c, side) {
  const wrap = el('div', { class: 'field-notes-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('field notes')));

  const body = el('div', { class: 'field-notes-body ' + side });
  const glyph = el('div', { class: 'glyph-inline' });
  glyph.innerHTML = renderGlyph(c.species);
  attachLongPress(glyph, () => openInspectModal(c), null);

  const lines = (VOICE.notes[c.species] || VOICE.notes[c.type] || ['—', '—', '—']);
  const prose = el('div', { class: 'field-notes-prose' });
  for (const line of lines) {
    const lineEl = el('div', { class: 'fn-line' });
    lineEl.innerHTML = parseProse(line);
    prose.appendChild(lineEl);
  }
  if (side === 'enemy') {
    body.appendChild(prose);
    body.appendChild(glyph);
  } else {
    body.appendChild(glyph);
    body.appendChild(prose);
  }
  wrap.appendChild(body);
  return wrap;
}

function hpRowEl(f, side) {
  const max = f.creature.maxHp;
  const cur = Math.max(0, f.hp);
  const row = el('div', { class: 'hp-row-doc ' + side });

  const label = el('span', { class: 'hp-label' }, 'hp');
  const bar = el('span', { class: 'hp-bar-doc' });
  const fill = el('span', { class: 'hp-bar-doc-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);

  const num = el('span', { class: 'hp-num' });
  if (side === 'player') {
    num.appendChild(el('span', { class: 'hp-cur' }, pad3(cur)));
    num.appendChild(el('span', { class: 'hp-slash' }, ' / '));
    num.appendChild(el('span', { class: 'hp-max' }, pad3(max)));
  } else {
    // enemy hp: only the bar fill reads — both numbers redacted.
    num.appendChild(el('span', { class: 'hp-cur dim' }, '—'));
    num.appendChild(el('span', { class: 'hp-slash' }, ' / '));
    num.appendChild(el('span', { class: 'redact', style: 'width:3ch' }, ' '));
  }

  // mirror order for enemy
  if (side === 'player') {
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(num);
  } else {
    row.appendChild(num);
    row.appendChild(bar);
    row.appendChild(label);
  }
  return row;
}

function statBlockEl(f, side) {
  const wrap = el('div', { class: 'stat-block-doc ' + side });
  const stats = f.creature.stats;
  const mods = f.statMods || { atk: 0, def: 0, spd: 0 };
  for (const [k, lbl] of [['atk', 'atk'], ['def', 'def'], ['spd', 'spd']]) {
    const baseVal = stats[k];
    const m = mods[k] || 0;
    const effective = Math.max(0, Math.round(baseVal * (1 + m)));
    const pct = Math.min(100, (effective / STAT_BAR_MAX) * 100);

    const row = el('div', { class: 'stat-row-bar ' + side });
    const label = el('span', { class: 'stat-bar-label' }, lbl);
    const bar = el('span', { class: 'stat-bar' });
    bar.appendChild(el('span', { class: 'stat-bar-fill', style: `width:${pct}%;` }));
    const num = el('span', { class: 'stat-bar-num' }, pad2(effective));
    if (Math.abs(m) > 0.01) {
      const tag = el('span', { class: 'stat-mod-tag ' + (m > 0 ? 'pos' : 'neg') },
        ` ${m > 0 ? '+' : ''}${Math.round(m * 100)}%`);
      num.appendChild(tag);
    }

    if (side === 'player') {
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(num);
    } else {
      row.appendChild(num);
      row.appendChild(bar);
      row.appendChild(label);
    }
    wrap.appendChild(row);
  }
  return wrap;
}

function afflictionsEl(f) {
  const wrap = el('div', { class: 'afflictions-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('afflictions')));

  const items = activeAfflictions(f);
  const inner = el('div', { class: 'afflictions-list' });
  if (items.length === 0) {
    inner.appendChild(el('span', { class: 'aff-empty' }, '— none observed —'));
  } else {
    items.forEach((a, i) => {
      if (i > 0) inner.appendChild(el('span', { class: 'aff-sep' }, ' · '));
      inner.appendChild(el('span', { class: 'doc-blot aff-blot' }, '●'));
      inner.appendChild(el('span', { class: 'aff-name' }, ` ${a.label}`));
      if (a.suffix) inner.appendChild(el('span', { class: 'aff-suffix' }, ` ${a.suffix}`));
    });
  }
  wrap.appendChild(inner);
  return wrap;
}

function activeAfflictions(f) {
  const out = [];
  const s = f.statuses || {};
  if (s.burn)    out.push({ label: VOICE.afflictions.burn    || 'burning',  suffix: `${s.burn.turns}t` });
  if (s.bloom)   out.push({ label: VOICE.afflictions.bloom   || 'blooming', suffix: `${s.bloom.turns}t` });
  if (s.soaking) out.push({ label: VOICE.afflictions.soaking || 'soaking',  suffix: `${s.soaking.turns}t` });
  if (s.cursed)  out.push({ label: VOICE.afflictions.cursed  || 'cursed',   suffix: `${s.cursed.turns}t` });
  if (s.dazed)   out.push({ label: VOICE.afflictions.dazed   || 'dazed',    suffix: `${s.dazed.turns}t` });
  if (f.healing && f.healing.turnsLeft > 0) {
    out.push({ label: 'healing', suffix: `${f.healing.turnsLeft}t` });
  }
  return out;
}

function passivesEl(c) {
  const wrap = el('div', { class: 'passives-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('passives')));

  const list = (c.passives && c.passives.length) ? c.passives : [];
  if (list.length === 0) {
    wrap.appendChild(el('div', { class: 'passive-empty' }, '— none observed —'));
    return wrap;
  }
  for (const k of list) {
    const p = PASSIVES[k];
    const voice = VOICE.passives[k];
    const mech = (p && p.desc) ? p.desc : '';
    const prose = voice || mech || '—';
    const showMech = !!voice && !!mech;

    const row = el('div', { class: 'passive-line-doc' });
    const top = el('div', { class: 'passive-prose' });
    top.appendChild(el('span', { class: 'passive-bullet' }, '•'));
    top.appendChild(el('span', { class: 'passive-name-doc' }, p ? p.name : k));
    top.appendChild(el('span', { class: 'passive-sep' }, ' · '));
    const desc = el('span', { class: 'passive-desc-doc' });
    desc.innerHTML = parseProse(prose);
    top.appendChild(desc);
    row.appendChild(top);
    if (showMech) {
      row.appendChild(el('div', { class: 'passive-mech' }, mech));
    }
    wrap.appendChild(row);
  }
  return wrap;
}

// ── action box ───────────────────────────────────────────────────────
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
  const wrap = el('div', { class: 'narrative-block' });
  const lines = state.log.slice(-3).reverse();
  if (lines.length === 0) {
    wrap.appendChild(el('div', { class: 'narr-line primary' }, '— silence —'));
  } else {
    lines.forEach((entry, i) => {
      const cls = 'narr-line ' + (i === 0 ? 'primary ' : 'secondary ') + (entry.cls || '');
      const line = el('div', { class: cls });
      const text = el('span', { class: 'narr-text' });
      text.innerHTML = parseProse((entry.msg || '').toString().toLowerCase());
      line.appendChild(text);
      const dmg = extractDamage(entry.msg || '');
      if (dmg !== null && i === 0) {
        line.appendChild(el('span', { class: 'narr-dmg' }, ` ${dmg < 0 ? '' : '−'}${Math.abs(dmg)}`));
      }
      wrap.appendChild(line);
    });
  }
  wrap.appendChild(el('div', { class: 'narr-footer' }, '▸ awaiting next event'));
  return wrap;
}

function extractDamage(msg) {
  // crude: pull a leading number from "Deals 47 damage." or similar.
  const m = String(msg).match(/(\d+)\s+damage/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function actionMenuEl() {
  const wrap = el('div', { class: 'action-menu-doc' });
  wrap.appendChild(el('div', { class: 'menu-prompt' }, '▸ what i may do'));

  if (state.pf.queuedAbility) {
    wrap.appendChild(queuedActionRow());
    return wrap;
  }

  const split = el('div', { class: 'action-split' });
  const list = el('div', { class: 'action-list' });
  const detail = el('div', { class: 'action-detail' });
  let initialKey = null;

  const abilities = state.pf.creature.abilities;
  abilities.forEach((k, i) => {
    const a = ABILITIES[k];
    if (!a) return;
    const row = el('button', { class: 'action-row' + (i === 0 ? ' is-default' : '') });
    if (state.acting) row.disabled = true;
    row.appendChild(el('span', { class: 'action-marker' }, '▸ '));
    row.appendChild(el('span', { class: 'action-name' }, a.name.toLowerCase()));
    row.appendChild(actionRowHintEl(a));

    row.addEventListener('mouseenter', () => fillDetail(detail, k));
    row.addEventListener('focus',      () => fillDetail(detail, k));
    attachLongPress(row,
      () => openAbilityTooltip(k),
      state.acting ? null : () => playerAct(k));
    list.appendChild(row);
    if (i === 0) initialKey = k;
  });

  // swap row
  const canSwap = state.bf && state.bf.hp > 0 && !state.acting;
  const swap = el('button', { class: 'action-row swap' + (canSwap ? '' : ' disabled') });
  swap.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  const swapText = state.bf
    ? `step back · ${displayName(state.bf.creature).toLowerCase()} forward`
    : 'step back · no one to send';
  swap.appendChild(el('span', { class: 'action-name' }, swapText));
  swap.appendChild(el('span', { class: 'action-tag swap' }, ' swap'));
  if (canSwap) swap.addEventListener('click', () => playerSwap());
  else swap.disabled = true;
  swap.addEventListener('mouseenter', () => fillSwapDetail(detail));
  swap.addEventListener('focus',      () => fillSwapDetail(detail));
  list.appendChild(swap);

  if (initialKey) fillDetail(detail, initialKey);

  split.appendChild(list);
  split.appendChild(el('div', { class: 'action-split-rule' }));
  split.appendChild(detail);
  wrap.appendChild(split);
  return wrap;
}

function fillDetail(node, key) {
  const a = ABILITIES[key];
  if (!a) return;
  node.innerHTML = '';
  const meta = el('div', { class: 'detail-meta' });
  if (a.element) meta.appendChild(el('span', { class: 'detail-elem' }, `${a.element}`));
  const power = phasePowerFor(a, 0);
  if (power > 0) {
    if (a.element) meta.appendChild(el('span', {}, ' · '));
    const dmg = abilityDamageEffect(a);
    const hits = (dmg && dmg.hits) || 1;
    meta.appendChild(el('span', { class: 'detail-pow' },
      hits > 1 ? `${dmg.power}×${hits} damage` : `${power} damage`));
  } else {
    if (a.element) meta.appendChild(el('span', {}, ' · '));
    meta.appendChild(el('span', { class: 'detail-tag' }, abilityKindTag(a) || 'effect'));
  }
  if (meta.children.length) node.appendChild(meta);

  if (a.desc) {
    const desc = el('div', { class: 'detail-desc' });
    desc.innerHTML = parseProse(a.desc.toLowerCase());
    node.appendChild(desc);
  }
  if (a.phases && a.phases.length > 1) {
    node.appendChild(el('div', { class: 'detail-phase' },
      `${a.phases.length} phases · resolves over consecutive turns.`));
  }
}

function fillSwapDetail(node) {
  node.innerHTML = '';
  if (!state.bf) {
    node.appendChild(el('div', { class: 'detail-desc' }, 'no companion is ready.'));
    return;
  }
  const c = state.bf.creature;
  node.appendChild(el('div', { class: 'detail-meta' }, [
    el('span', { class: 'detail-tag' }, 'swap'),
  ]));
  const desc = el('div', { class: 'detail-desc' });
  desc.innerHTML = parseProse(`step back. ${displayName(c).toLowerCase()} steps forward to take the next blow.`);
  node.appendChild(desc);
}

function queuedActionRow() {
  const q = state.pf.queuedAbility;
  const a = ABILITIES[q.key];
  const total = (a && a.phases ? a.phases.length : 1);
  const isLast = q.phaseIdx === total - 1;
  const split = el('div', { class: 'action-split' });
  const list = el('div', { class: 'action-list' });

  const row = el('button', { class: 'action-row queued is-default' });
  if (state.acting) row.disabled = true;
  row.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  row.appendChild(el('span', { class: 'action-name' },
    isLast ? `release · ${(a ? a.name : '?').toLowerCase()}`
           : `continue · ${(a ? a.name : '?').toLowerCase()} (${q.phaseIdx + 1}/${total})`));
  attachLongPress(row,
    () => openAbilityTooltip(q.key),
    state.acting ? null : () => playerAct(null));
  list.appendChild(row);

  const detail = el('div', { class: 'action-detail' });
  if (a) {
    const desc = el('div', { class: 'detail-desc' });
    desc.innerHTML = parseProse((a.desc || '').toLowerCase());
    detail.appendChild(desc);
    detail.appendChild(el('div', { class: 'detail-phase' },
      `phase ${q.phaseIdx + 1} of ${total}.`));
  }

  split.appendChild(list);
  split.appendChild(el('div', { class: 'action-split-rule' }));
  split.appendChild(detail);
  return split;
}

// ── helpers ──────────────────────────────────────────────────────────
function sectionLabel(text) { return `─ ${text} ─`; }
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
function pad3(n) { return String(Math.max(0, n | 0)).padStart(3, '0'); }

function roman(n) {
  const map = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
               [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let s = ''; let v = Math.max(1, n | 0);
  for (const [k, sym] of map) { while (v >= k) { s += sym; v -= k; } }
  return s;
}

function composureWord(f) {
  const pct = f.hp / f.creature.maxHp;
  if (pct >= 0.85) return 'composed';
  if (pct >= 0.55) return 'steady';
  if (pct >= 0.30) return 'fraying';
  if (pct >  0.00) return 'unmade';
  return 'still';
}

function abilityFlatEffects(a) { return (a && a.phases ? a.phases : []).flat(); }
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
  if (flat.some(e => e.type === 'damage'))         return null;
  if (flat.some(e => e.type === 'heal_over_time')) return 'heal';
  if (flat.some(e => e.type === 'swap'))           return 'swap';
  if (flat.some(e => e.type === 'buff'))           return 'shore';
  if (flat.some(e => e.type === 'apply_status'))   return 'mark';
  if (flat.some(e => e.type === 'cleanse'))        return 'cleanse';
  if (flat.some(e => e.type === 'bracing'))        return 'brace';
  return null;
}

// Right-side gameplay hint on each action row: power value for damage
// abilities, a short kind tag otherwise, plus a small +/− mark for
// element matchup against the current target.
function actionRowHintEl(a) {
  const wrap = el('span', { class: 'action-tag' });
  const power = phasePowerFor(a, 0);
  const isMulti = a.phases && a.phases.length > 1;
  if (power > 0) {
    const dmg = abilityDamageEffect(a);
    const hits = (dmg && dmg.hits) || 1;
    wrap.appendChild(el('span', { class: 'action-pow' },
      hits > 1 ? `${dmg.power}×${hits}` : String(power)));
    if (isMulti) wrap.appendChild(el('span', { class: 'action-multi' }, ` ·${a.phases.length}p`));
    if (a.element && state.ef && state.ef.creature) {
      const m = TYPE_CHART[a.element]?.[state.ef.creature.type];
      if (m > 1)      wrap.appendChild(el('span', { class: 'eff-mark good' }, ' +'));
      else if (m < 1) wrap.appendChild(el('span', { class: 'eff-mark bad'  }, ' −'));
    }
  } else if (isMulti) {
    wrap.appendChild(el('span', { class: 'action-multi' }, `${a.phases.length}p`));
  } else {
    const t = abilityKindTag(a);
    if (t) wrap.appendChild(el('span', {}, t));
    else   wrap.appendChild(el('span', {}, '·'));
  }
  return wrap;
}
