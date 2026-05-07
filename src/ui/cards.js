import { el, attachLongPress } from './dom.js';
import { PASSIVES, ABILITIES } from '../data.js';
import { renderCreatureSvg } from '../art.js';
import { displayName, growthRank, rankColor, xpToNext } from '../creature.js';

export function portraitEl(creature, sizePx) {
  const wrap = el('div', { class: 'creature-portrait', style: sizePx ? `width:${sizePx}px;height:${sizePx}px;` : '' });
  wrap.innerHTML = renderCreatureSvg(creature);
  return wrap;
}

export function creatureCardEl(c, options = {}) {
  const isSelectable = !!options.selectable;
  const card = el('div', { class: 'creature-card' + (isSelectable ? ' selectable' : '') + (options.selected ? ' selected' : '') + (options.dimmed ? ' dimmed' : '') });
  if (!options.noInspect) {
    card.classList.add('inspectable');
    attachLongPress(card,
      () => openInspectModal(c),
      isSelectable && options.onclick ? options.onclick : null
    );
  } else if (isSelectable && options.onclick) {
    card.addEventListener('click', options.onclick);
  }
  card.appendChild(portraitEl(c));
  const info = el('div', { class: 'creature-info' });
  const header = el('div', { class: 'creature-header' });
  header.appendChild(el('div', { class: 'creature-name' }, displayName(c)));
  const meta = el('div', { class: 'creature-meta' }, [
    el('span', { class: 'type-pip ' + c.type }),
    el('span', { class: 'type-' + c.type }, c.type.toUpperCase()),
  ]);
  header.appendChild(meta);
  info.appendChild(header);

  const statRow = el('div', { class: 'stat-row' + (options.showGrowths ? ' with-growths' : '') });
  for (const [label, val, growth] of [['HP', c.stats.hp, c.growth.hp], ['ATK', c.stats.atk, c.growth.atk], ['DEF', c.stats.def, c.growth.def], ['SPD', c.stats.spd, c.growth.spd]]) {
    const s = el('div', { class: 'stat' });
    s.appendChild(el('div', { class: 'stat-label' }, label));
    s.appendChild(el('div', { class: 'stat-value' }, String(val)));
    if (options.showGrowths) {
      const r = growthRank(growth);
      s.appendChild(el('div', { class: 'stat-growth rank-' + r, style: `color:${rankColor(r)};border-color:${rankColor(r)};` }, r));
    }
    statRow.appendChild(s);
  }
  info.appendChild(statRow);

  info.appendChild(el('div', { class: 'level-line' }, `LVL ${c.level} · XP ${c.xp}/${xpToNext(c.level)}`));
  const xpBar = el('div', { class: 'xp-bar' });
  xpBar.appendChild(el('div', { class: 'xp-fill', style: `width:${Math.min(100, c.xp / xpToNext(c.level) * 100)}%;` }));
  info.appendChild(xpBar);

  if (c.passives && c.passives.length) {
    const pline = el('div', { class: 'passive-line' });
    const parts = c.passives.map((k, i) => {
      const p = PASSIVES[k];
      return p ? (i > 0 ? '◇ ' : '◆ ') + p.name : k;
    });
    pline.appendChild(el('span', {}, parts.join('   ')));
    info.appendChild(pline);
  }

  card.appendChild(info);
  return card;
}

export function openInspectModal(c) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
  const m = el('div', { class: 'modal inspect-modal' });

  const head = el('div', { class: 'inspect-head' });
  const port = el('div', { class: 'inspect-portrait' });
  port.innerHTML = renderCreatureSvg(c);
  head.appendChild(port);
  const headInfo = el('div', { class: 'inspect-headinfo' });
  headInfo.appendChild(el('div', { class: 'inspect-name' }, displayName(c)));
  headInfo.appendChild(el('div', { class: 'inspect-subhead' }, [
    el('span', { class: 'type-pip ' + c.type }),
    el('span', { class: 'type-' + c.type }, c.type.toUpperCase()),
    el('span', { style: 'color: var(--text-faint); margin: 0 8px;' }, '·'),
    el('span', {}, `${c.species}`),
    el('span', { style: 'color: var(--text-faint); margin: 0 8px;' }, '·'),
    el('span', {}, `LVL ${c.level}`),
  ]));
  head.appendChild(headInfo);
  m.appendChild(head);

  const sg = el('div', { class: 'inspect-stats' });
  for (const [label, val, growth] of [['HP', c.stats.hp, c.growth.hp], ['ATK', c.stats.atk, c.growth.atk], ['DEF', c.stats.def, c.growth.def], ['SPD', c.stats.spd, c.growth.spd]]) {
    const rank = growthRank(growth);
    const cell = el('div', { class: 'inspect-stat' });
    cell.appendChild(el('div', { class: 'inspect-stat-label' }, label));
    cell.appendChild(el('div', { class: 'inspect-stat-value' }, String(val)));
    const rankWrap = el('div', { class: 'inspect-rank-wrap' });
    rankWrap.appendChild(el('span', { class: 'inspect-rank-label' }, 'GROWTH'));
    rankWrap.appendChild(el('span', { class: 'inspect-rank-tag rank-' + rank, style: `color:${rankColor(rank)};border-color:${rankColor(rank)};` }, rank));
    cell.appendChild(rankWrap);
    sg.appendChild(cell);
  }
  m.appendChild(sg);

  m.appendChild(el('div', { class: 'inspect-section-title' }, 'PASSIVES'));
  if (c.passives && c.passives.length) {
    for (const k of c.passives) {
      const p = PASSIVES[k];
      const row = el('div', { class: 'inspect-row' });
      row.appendChild(el('div', { class: 'inspect-row-name' }, p ? '◆ ' + p.name : k));
      row.appendChild(el('div', { class: 'inspect-row-desc' }, p ? p.desc : '(unknown)'));
      m.appendChild(row);
    }
  } else {
    m.appendChild(el('div', { class: 'inspect-row-desc', style: 'padding: 0 0 8px;' }, '(none)'));
  }

  m.appendChild(el('div', { class: 'inspect-section-title' }, 'ABILITIES'));
  for (const k of c.abilities) {
    const a = ABILITIES[k];
    const row = el('div', { class: 'inspect-row' });
    const nameRow = el('div', { class: 'inspect-row-name' });
    if (a && a.element) nameRow.appendChild(el('span', { class: 'type-pip ' + a.element }));
    nameRow.appendChild(el('span', {}, a ? a.name : k));
    if (a && a.power && a.power > 0) {
      const hits = a.hits || 1;
      const pwTag = hits > 1 ? `pw ${a.power}×${hits}` : `pw ${a.power}`;
      nameRow.appendChild(el('span', { class: 'inspect-tag' }, pwTag));
    }
    if (a && a.priority) {
      const pTag = a.priority > 0 ? `+${a.priority} prio` : `${a.priority} prio`;
      nameRow.appendChild(el('span', { class: 'inspect-tag' }, pTag));
    }
    row.appendChild(nameRow);
    row.appendChild(el('div', { class: 'inspect-row-desc' }, a ? a.desc : '(unknown)'));
    m.appendChild(row);
  }

  const closeRow = el('div', { class: 'modal-actions' });
  closeRow.appendChild(el('button', { class: 'primary', onclick: () => { root.innerHTML = ''; } }, 'Close'));
  m.appendChild(closeRow);

  bg.appendChild(m);
  root.appendChild(bg);
}

function metaCell(label, val, valCls, wide) {
  const cell = el('div', { class: 'tooltip-meta-cell' + (wide ? ' wide' : '') });
  cell.appendChild(el('div', { class: 'tooltip-meta-label' }, label));
  cell.appendChild(el('div', { class: 'tooltip-meta-val' + (valCls ? ' ' + valCls : '') }, val));
  return cell;
}

export function openAbilityTooltip(abilityKey) {
  const a = ABILITIES[abilityKey];
  if (!a) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
  const m = el('div', { class: 'modal ability-tooltip-modal' });
  m.appendChild(el('div', { class: 'tooltip-name' }, [
    a.element ? el('span', { class: 'type-pip ' + a.element, style: 'width:9px;height:9px;margin-right:8px;' }) : null,
    a.name,
  ].filter(Boolean)));
  const meta = el('div', { class: 'tooltip-meta' });
  if (a.element) meta.appendChild(metaCell('ELEMENT', a.element.toUpperCase(), 'type-' + a.element));
  meta.appendChild(metaCell('KIND', (a.kind || 'attack').toUpperCase()));
  if (a.power !== undefined) meta.appendChild(metaCell('BASE POWER', String(a.power)));
  if (a.priority) meta.appendChild(metaCell('PRIORITY', (a.priority > 0 ? '+' : '') + a.priority));
  if (a.statMult) {
    const parts = Object.entries(a.statMult).map(([k, v]) => `${k.toUpperCase()} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
    meta.appendChild(metaCell('BUFF', parts.join(' '), '', true));
  }
  if (a.healPercent) meta.appendChild(metaCell('HEAL/TURN', Math.round(a.healPercent * 100) + '%', '', true));
  if (a.healTurns) meta.appendChild(metaCell('DURATION', a.healTurns + ' turns'));
  if (a.hpCost) meta.appendChild(metaCell('HP COST', Math.round(a.hpCost * 100) + '%'));
  m.appendChild(meta);
  m.appendChild(el('div', { class: 'tooltip-desc' }, a.desc));
  const closeRow = el('div', { class: 'modal-actions' });
  closeRow.appendChild(el('button', { class: 'primary', onclick: () => { root.innerHTML = ''; } }, 'Close'));
  m.appendChild(closeRow);
  bg.appendChild(m);
  root.appendChild(bg);
}
