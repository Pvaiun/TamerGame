import { ART_GENERATORS } from '../../src/art.js';

// ─── State ───────────────────────────────────────────────────────────────────

const S = {
  abilities: {}, passives: {}, statuses: {}, additionalEffects: {}, templates: [], types: [], typePalette: {},
  dirty: { abilities: false, passives: false, templates: false, statuses: false },
  tab: 'monsters',
  monster: null,   // selected template index
  ability: null,   // selected ability key
  passive: null,   // selected passive key
  status: null,    // selected status key
  pat: '', branch: 'main',
  statusMsg: '', statusError: false,
  search: { monsters: '', abilities: '', passives: '', statuses: '', abilityKind: '', abilitySort: 'name' },
};

// ─── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [types, passives, abilities, statuses, additionalEffects, templates] = await Promise.all([
      fetch('../../data/types.json').then(r => r.json()),
      fetch('../../data/passives.json').then(r => r.json()),
      fetch('../../data/abilities.json').then(r => r.json()),
      fetch('../../data/statuseffects.json').then(r => r.json()),
      fetch('../../data/additionaleffects.json').then(r => r.json()),
      fetch('../../data/templates.json').then(r => r.json()),
    ]);
    S.types = types.TYPES;
    S.typePalette = types.TYPE_PALETTE;
    S.passives = passives;
    S.abilities = abilities;
    S.statuses = statuses;
    S.additionalEffects = additionalEffects;
    S.templates = templates;
  } catch (e) {
    document.getElementById('content').innerHTML = `<p style="padding:20px;color:#d94a3a">Failed to load data: ${e.message}</p>`;
    return;
  }
  renderAll();
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderAll() {
  renderHeader();
  renderTabs();
  renderContent();
}

function renderHeader() {
  const anyDirty = Object.values(S.dirty).some(Boolean);
  const el = document.getElementById('header');
  el.innerHTML = `
    <div class="header-title">TamerGame Designer</div>
    <div class="header-controls">
      <span class="status-msg" id="status-msg" style="color:${S.statusError ? '#d94a3a' : '#7acc88'}">${S.statusMsg}</span>
      <input type="password" id="pat-input" placeholder="GitHub PAT" value="${S.pat}">
      <input type="text" id="branch-input" value="${S.branch}" placeholder="branch">
      <button class="commit-btn ${anyDirty ? 'dirty' : ''}" id="commit-btn" ${anyDirty ? '' : 'disabled'}>
        ${anyDirty ? '● Commit changes' : 'No changes'}
      </button>
    </div>`;
  document.getElementById('pat-input').addEventListener('input', e => { S.pat = e.target.value; });
  document.getElementById('branch-input').addEventListener('input', e => { S.branch = e.target.value; });
  document.getElementById('commit-btn').addEventListener('click', openCommitModal);
}

function renderTabs() {
  const el = document.getElementById('tabs');
  const tabs = [
    { key: 'monsters',  label: 'Monsters',        dirty: S.dirty.templates },
    { key: 'abilities', label: 'Abilities',        dirty: S.dirty.abilities },
    { key: 'passives',  label: 'Passives',         dirty: S.dirty.passives },
    { key: 'statuses',  label: 'Status Effects',   dirty: S.dirty.statuses },
  ];
  el.innerHTML = tabs.map(t =>
    `<button class="tab ${S.tab === t.key ? 'active' : ''} ${t.dirty ? 'dirty' : ''}" data-tab="${t.key}">
      ${t.label}${t.dirty ? ' ●' : ''}
    </button>`
  ).join('');
  el.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => { S.tab = btn.dataset.tab; renderAll(); })
  );
}

function renderContent() {
  const el = document.getElementById('content');
  if (S.tab === 'monsters')  el.innerHTML = monstersTabHTML();
  if (S.tab === 'abilities') el.innerHTML = abilitiesTabHTML();
  if (S.tab === 'passives')  el.innerHTML = passivesTabHTML();
  if (S.tab === 'statuses')  el.innerHTML = statusEffectsTabHTML();
  bindContentEvents();
}

// ─── Monsters Tab ────────────────────────────────────────────────────────────

function monstersTabHTML() {
  const q = S.search.monsters.toLowerCase();
  const items = S.templates
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !q || t.species.toLowerCase().includes(q));
  const listHTML = items.map(({ t, i }) => `
    <div class="list-item ${S.monster === i ? 'selected' : ''}" data-idx="${i}">
      <span class="type-badge type-${t.type}">${t.type[0].toUpperCase()}</span>
      <div>
        <div class="list-item-name">${t.species}</div>
        <div class="list-item-sub">${t.starter ? '★ Starter' : ''}</div>
      </div>
    </div>`).join('');

  const t = S.monster !== null ? S.templates[S.monster] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-monsters" placeholder="Search…" value="${S.search.monsters}"></div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${t ? monsterFormHTML(t) : '<div class="empty">Select a monster to edit.</div>'}</div>`;
}

function monsterFormHTML(t) {
  const passiveOpts = Object.entries(S.passives)
    .map(([k, p]) => `<option value="${k}" ${t.primaryPassive === k ? 'selected' : ''}>${p.name} (${k})</option>`).join('');
  const passiveOpts2 = Object.entries(S.passives)
    .map(([k, p]) => `<option value="${k}" ${t.secondaryPassive === k ? 'selected' : ''}>${p.name} (${k})</option>`).join('');
  const typeOpts = S.types.map(ty =>
    `<option value="${ty}" ${t.type === ty ? 'selected' : ''}>${ty}</option>`).join('');

  const abilityChips = Object.entries(S.abilities)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([k, ab]) => {
      const active = t.abilityPool.includes(k);
      return `<span class="chip ${active ? 'active' : ''}" data-ability-key="${k}" title="Long-press → edit in Abilities tab">${ab.name}</span>`;
    }).join('');

  const palette = S.typePalette[t.type] || { primary: '#666', secondary: '#888', accent: '#aaa', dark: '#333' };
  const gen = ART_GENERATORS[t.species];
  const svgHTML = gen ? gen(palette) : '<svg viewBox="0 0 120 100"><circle cx="60" cy="60" r="20" fill="#666"/></svg>';

  return `
    <div class="form-section">
      <div class="form-section-title">Identity</div>
      <div class="form-row"><label>Species key</label><input type="text" data-field="species" value="${t.species}"></div>
      <div class="form-row">
        <label>Type</label>
        <select data-field="type">${typeOpts}</select>
        <label style="min-width:auto">Starter</label>
        <input type="checkbox" data-field="starter" ${t.starter ? 'checked' : ''}>
        <div class="portrait-box">${svgHTML}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Base Stats</div>
      <div class="stat-grid">
        ${['hp','atk','def','spd'].map(s => `
          <div class="stat-cell">
            <label>${s.toUpperCase()}</label>
            <input type="number" data-stat-base="${s}" value="${t.baseStats[s]}" min="1">
          </div>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Growth Rates</div>
      <div class="stat-grid">
        ${['hp','atk','def','spd'].map(s => `
          <div class="stat-cell">
            <label>${s.toUpperCase()}</label>
            <input type="number" data-stat-growth="${s}" value="${t.growth[s]}" step="0.1" min="0">
          </div>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Passives</div>
      <div class="form-row"><label>Primary</label><select data-field="primaryPassive">${passiveOpts}</select></div>
      <div class="form-row"><label>Secondary</label><select data-field="secondaryPassive">${passiveOpts2}</select></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Ability Pool <span style="color:var(--text-muted);font-size:10px;font-weight:400">(click to toggle · long-press to edit)</span></div>
      <div class="chip-grid">${abilityChips}</div>
    </div>`;
}

// ─── Abilities Tab ───────────────────────────────────────────────────────────

const KIND_FILTERS = [
  { key: '',               label: 'All' },
  { key: 'attack',         label: 'Attack' },
  { key: 'charge_attack',  label: 'Charge' },
  { key: 'buff',           label: 'Buff' },
  { key: 'debuff',         label: 'Debuff' },
  { key: 'apply_heal',     label: 'Heal' },
  { key: 'bench_support',  label: 'Bench' },
  { key: 'swap_self',      label: 'Swap' },
];

function abilitiesTabHTML() {
  const q   = S.search.abilities.toLowerCase();
  const kf  = S.search.abilityKind;
  const srt = S.search.abilitySort;
  const entries = Object.entries(S.abilities)
    .filter(([k, a]) => (!kf || a.kind === kf) && (!q || a.name.toLowerCase().includes(q) || k.includes(q)))
    .sort((a, b) => {
      if (srt === 'element') {
        const ea = a[1].element || '', eb = b[1].element || '';
        return ea.localeCompare(eb) || a[1].name.localeCompare(b[1].name);
      }
      if (srt === 'power') {
        return (b[1].power ?? -1) - (a[1].power ?? -1);
      }
      return a[1].name.localeCompare(b[1].name);
    });
  const listHTML = entries.map(([k, a]) => `
    <div class="list-item ${S.ability === k ? 'selected' : ''}" data-ability="${k}">
      <div>
        <div class="list-item-name">${a.name}</div>
        <div class="list-item-sub">${a.kind}${a.element ? ' · ' + a.element : ''}${a.power ? ' · ' + a.power : ''}</div>
      </div>
    </div>`).join('');

  const filterBtns = KIND_FILTERS.map(f =>
    `<button class="kind-filter-btn ${kf === f.key ? 'active' : ''}" data-kind="${f.key}">${f.label}</button>`
  ).join('');

  const sortOpts = [['name','Name'],['element','Element'],['power','Power']]
    .map(([v, l]) => `<option value="${v}" ${srt === v ? 'selected' : ''}>${l}</option>`).join('');

  const ab = S.ability ? S.abilities[S.ability] : null;
  return `
    <div class="list-panel">
      <div class="list-search">
        <input id="search-abilities" placeholder="Search…" value="${S.search.abilities}">
        <select id="sort-abilities">${sortOpts}</select>
      </div>
      <div class="kind-filter">${filterBtns}</div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${ab ? abilityFormHTML(S.ability, ab) : '<div class="empty">Select an ability to edit.</div>'}</div>`;
}

// Bench-support effects still read from ability.effect (handled separately in battle.js)
const BENCH_EFFECTS = {
  bench_bloom:    'Apply Bloom to bench ally',
  bench_buff_atk: 'Buff bench ally ATK +25%',
  bench_buff_def: 'Buff bench ally DEF +30%',
};

function statusEffectsFormHTML(ab) {
  const seList = (ab.statusEffects || []);
  const statusOpts = Object.entries(S.statuses)
    .map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  const TARGETS = ['self', 'bench', 'enemy', 'enemy_bench'];
  const TARGET_LABELS = { self: 'Self', bench: 'Bench', enemy: 'Enemy', enemy_bench: 'Enemy Bench' };

  const rows = seList.map((se, i) => `
    <div class="se-row" data-se-idx="${i}">
      <select data-se-status="${i}">${Object.entries(S.statuses).map(([k, s]) =>
        `<option value="${k}" ${se.status === k ? 'selected' : ''}>${s.name}</option>`
      ).join('')}</select>
      <div class="se-targets">
        ${TARGETS.map(t => `
          <label class="se-target-label">
            <input type="checkbox" data-se-target="${i}" data-tgt="${t}" ${(se.targets||[]).includes(t) ? 'checked' : ''}>
            ${TARGET_LABELS[t]}
          </label>`).join('')}
      </div>
      <button class="btn-icon" data-se-remove="${i}">✕</button>
    </div>`).join('');

  const addDisabled = Object.keys(S.statuses).length === 0 ? 'disabled' : '';
  return `
    <div class="form-section">
      <div class="form-section-title">Status Effects</div>
      <div id="se-list">${rows}</div>
      <button class="btn btn-secondary btn-sm" id="se-add" ${addDisabled}>+ Add status effect</button>
    </div>`;
}

// ─── Additional Effects ──────────────────────────────────────────────────────
// Each instance on an ability is { type, ...params }. The schema in
// data/additionaleffects.json defines per-type params (label + type + default).
// Missing params fall back to defaults at runtime (mirroring effParam in abilities.js).

const AE_TARGET_LABELS = { self: 'Self', bench: 'Bench', enemy: 'Enemy', enemy_bench: 'Enemy Bench' };
const AE_TARGETS_ALL   = ['self', 'bench', 'enemy', 'enemy_bench'];
const AE_SWAP_TARGETS  = ['self', 'enemy'];

function aeParamCurrent(eff, paramKey, schema) {
  return eff[paramKey] !== undefined ? eff[paramKey] : (schema?.default);
}

function aeParamHTML(rowIdx, paramKey, schema, current) {
  const dataAttr = `data-ae-param="${paramKey}" data-ae-row="${rowIdx}"`;
  const label = schema.label || paramKey;
  if (schema.type === 'percent') {
    const v = Math.round((current ?? 0) * 1000) / 10;
    return `<label class="ae-param"><span>${label} %</span><input type="number" ${dataAttr} data-ae-ptype="percent" value="${v}" step="0.1" min="0" max="100"></label>`;
  }
  if (schema.type === 'multiplier') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} data-ae-ptype="multiplier" value="${current ?? 1}" step="0.05" min="0"></label>`;
  }
  if (schema.type === 'bool') {
    return `<label class="ae-param ae-bool"><input type="checkbox" ${dataAttr} data-ae-ptype="bool" ${current ? 'checked' : ''}> ${label}</label>`;
  }
  if (schema.type === 'status') {
    const opts = Object.entries(S.statuses)
      .map(([k, s]) => `<option value="${k}" ${current === k ? 'selected' : ''}>${s.name}</option>`).join('');
    return `<label class="ae-param"><span>${label}</span><select ${dataAttr} data-ae-ptype="status">${opts}</select></label>`;
  }
  if (schema.type === 'targets' || schema.type === 'swapTargets') {
    const list = schema.type === 'swapTargets' ? AE_SWAP_TARGETS : AE_TARGETS_ALL;
    const arr = Array.isArray(current) ? current : [];
    const checks = list.map(t => `
      <label class="se-target-label">
        <input type="checkbox" ${dataAttr} data-ae-ptype="${schema.type}" data-ae-tgt="${t}" ${arr.includes(t) ? 'checked' : ''}>
        ${AE_TARGET_LABELS[t]}
      </label>`).join('');
    return `<div class="ae-param ae-targets"><span>${label}</span><div class="se-targets">${checks}</div></div>`;
  }
  return '';
}

function additionalEffectsFormHTML(ab) {
  const list = ab.additionalEffects || [];
  const typeKeys = Object.keys(S.additionalEffects);

  const rows = list.map((eff, i) => {
    const schema = S.additionalEffects[eff.type] || { label: eff.type, params: {} };
    const params = schema.params || {};
    const paramRows = Object.entries(params)
      .map(([pk, ps]) => aeParamHTML(i, pk, ps, aeParamCurrent(eff, pk, ps)))
      .join('');
    const typeOpts = typeKeys.map(k =>
      `<option value="${k}" ${eff.type === k ? 'selected' : ''}>${S.additionalEffects[k]?.label || k}</option>`
    ).join('');
    const desc = (schema.desc || '').replace(/"/g, '&quot;');
    return `
      <div class="ae-row" data-ae-idx="${i}">
        <div class="ae-row-head">
          <select data-ae-type-sel="${i}" title="${desc}">${typeOpts}</select>
          <button class="btn-icon" data-ae-remove="${i}">✕</button>
        </div>
        ${paramRows ? `<div class="ae-row-params">${paramRows}</div>` : ''}
      </div>`;
  }).join('');

  const addDisabled = typeKeys.length === 0 ? 'disabled' : '';
  return `
    <div class="form-section">
      <div class="form-section-title">Additional Effects <span style="color:var(--text-muted);font-size:10px;font-weight:400">(types defined in additionaleffects.json)</span></div>
      <div id="ae-list">${rows}</div>
      <button class="btn btn-secondary btn-sm" id="ae-add" ${addDisabled}>+ Add additional effect</button>
    </div>`;
}

function benchEffectSelectHTML(ab) {
  const opts = Object.entries(BENCH_EFFECTS)
    .map(([k, label]) => `<option value="${k}" ${ab.effect === k ? 'selected' : ''}>${label}</option>`)
    .join('');
  return `<div class="form-row"><label>Bench Effect</label><select data-ab-field="effect"><option value="">(none)</option>${opts}</select></div>`;
}

function abilityFormHTML(key, ab) {
  const kinds = ['attack','charge_attack','buff','debuff','apply_heal','bench_support','swap_self'];
  const kindOpts = kinds.map(k => `<option ${ab.kind === k ? 'selected' : ''}>${k}</option>`).join('');
  const typeOpts = ['', ...S.types].map(t => `<option value="${t}" ${(ab.element || '') === t ? 'selected' : ''}>${t || '(none)'}</option>`).join('');
  const isAttack = ab.kind === 'attack' || ab.kind === 'charge_attack';
  const isBuff = ab.kind === 'buff' || ab.kind === 'debuff';
  const isHeal = ab.kind === 'apply_heal';
  const isSwap = ab.kind === 'swap_self';
  const sm = ab.statMult || {};
  const bos = ab.buffOnSwap || {};

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-ab-field="name" value="${ab.name}"></div>
      <div class="form-row"><label>Description</label><textarea data-ab-field="desc">${ab.desc || ''}</textarea></div>
      <div class="form-row"><label>Kind</label><select data-ab-field="kind">${kindOpts}</select></div>
      <div class="form-row"><label>Element</label><select data-ab-field="element">${typeOpts}</select></div>
      <div class="form-row"><label>Priority</label><input type="number" data-ab-field="priority" value="${ab.priority ?? 0}" min="-3" max="3"></div>
    </div>
    ${isAttack ? `
    <div class="form-section">
      <div class="form-section-title">Attack</div>
      <div class="form-row"><label>Power</label><input type="number" data-ab-field="power" value="${ab.power ?? 0}" min="0"></div>
      <div class="form-row"><label>Hits</label><input type="number" data-ab-field="hits" value="${ab.hits ?? 1}" min="1"></div>
    </div>` : ''}
    ${isBuff ? `
    <div class="form-section">
      <div class="form-section-title">Stat Multipliers (on use)</div>
      <div class="stat-grid">
        ${['atk','def','spd'].map(s => `<div class="stat-cell"><label>${s.toUpperCase()}</label><input type="number" data-ab-statmult="${s}" value="${sm[s] ?? 0}" step="0.05"></div>`).join('')}
      </div>
    </div>` : ''}
    ${isHeal ? `
    <div class="form-section">
      <div class="form-section-title">Heal</div>
      <div class="form-row"><label>Heal %</label><input type="number" data-ab-field="healPercent" value="${Math.round((ab.healPercent ?? 0) * 100)}" min="0" max="100"></div>
      <div class="form-row"><label>Heal Turns</label><input type="number" data-ab-field="healTurns" value="${ab.healTurns ?? 0}" min="0"></div>
    </div>` : ''}
    ${isSwap ? `
    <div class="form-section">
      <div class="form-section-title">Swap Effects</div>
      <div class="form-row"><label>Heal On Swap %</label><input type="number" data-ab-field="healOnSwap" value="${Math.round((ab.healOnSwap ?? 0) * 100)}" min="0" max="100"></div>
      <div class="form-section-title" style="margin-top:8px">Buff On Swap</div>
      <div class="stat-grid">
        ${['atk','def','spd'].map(s => `<div class="stat-cell"><label>${s.toUpperCase()}</label><input type="number" data-ab-buffswap="${s}" value="${bos[s] ?? 0}" step="0.05"></div>`).join('')}
      </div>
    </div>` : ''}
    ${ab.kind === 'bench_support' ? benchEffectSelectHTML(ab) : ''}
    ${ab.kind !== 'bench_support' && ab.kind !== 'swap_self' ? statusEffectsFormHTML(ab) + additionalEffectsFormHTML(ab) : ''}`;
}

// ─── Passives Tab ────────────────────────────────────────────────────────────

function passivesTabHTML() {
  const q = S.search.passives.toLowerCase();
  const entries = Object.entries(S.passives)
    .filter(([k, p]) => !q || p.name.toLowerCase().includes(q) || k.includes(q))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const listHTML = entries.map(([k, p]) => `
    <div class="list-item ${S.passive === k ? 'selected' : ''}" data-passive="${k}">
      <div>
        <div class="list-item-name">${p.name}</div>
        <div class="list-item-sub">${k}</div>
      </div>
    </div>`).join('');

  const pv = S.passive ? S.passives[S.passive] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-passives" placeholder="Search…" value="${S.search.passives}"></div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${pv ? passiveFormHTML(S.passive, pv) : '<div class="empty">Select a passive to edit.</div>'}</div>`;
}

function passiveFormHTML(key, pv) {
  // Dynamic numeric/array/string params (everything except name, desc, codeRef)
  const SKIP = new Set(['name', 'desc', 'codeRef']);
  const paramRows = Object.entries(pv)
    .filter(([k]) => !SKIP.has(k))
    .map(([k, v]) => {
      if (typeof v === 'number') {
        return `<div class="form-row"><label>${k}</label><input type="number" data-pv-param="${k}" value="${v}" step="0.01"></div>`;
      }
      if (Array.isArray(v)) {
        return `<div class="form-row"><label>${k}</label><input type="text" data-pv-array="${k}" value="${v.join(', ')}" placeholder="comma-separated"></div>`;
      }
      if (typeof v === 'string') {
        return `<div class="form-row"><label>${k}</label><input type="text" data-pv-param-str="${k}" value="${v}"></div>`;
      }
      return '';
    }).join('');

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-pv-field="name" value="${pv.name}"></div>
      <div class="form-row"><label>Description</label><textarea data-pv-field="desc">${pv.desc || ''}</textarea></div>
      <div class="form-row"><label>Code ref</label><span class="readonly">${pv.codeRef || '—'}</span></div>
    </div>
    ${paramRows ? `<div class="form-section"><div class="form-section-title">Balance Params</div>${paramRows}</div>` : ''}`;
}

// ─── Status Effects Tab ──────────────────────────────────────────────────────

function statusEffectsTabHTML() {
  const q = S.search.statuses.toLowerCase();
  const entries = Object.entries(S.statuses)
    .filter(([k, s]) => !q || s.name.toLowerCase().includes(q) || k.includes(q))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const listHTML = entries.map(([k, s]) => `
    <div class="list-item ${S.status === k ? 'selected' : ''}" data-status="${k}">
      <div>
        <div class="list-item-name">${s.name}</div>
        <div class="list-item-sub">${k} · ${s.tickKind}</div>
      </div>
    </div>`).join('');

  const sv = S.status ? S.statuses[S.status] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-statuses" placeholder="Search…" value="${S.search.statuses}"></div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${sv ? statusFormHTML(S.status, sv) : '<div class="empty">Select a status to edit.</div>'}</div>`;
}

function statusFormHTML(key, sv) {
  const tickKinds = ['damage', 'heal', 'none'];
  const tickOpts = tickKinds.map(k => `<option ${sv.tickKind === k ? 'selected' : ''}>${k}</option>`).join('');
  const stackOpts = ['refresh', 'extend', 'stack'].map(k =>
    `<option ${sv.stacking === k ? 'selected' : ''}>${k}</option>`).join('');
  const showPpt   = sv.tickKind === 'damage' || sv.tickKind === 'heal';
  const showSwap  = sv.percentOnSwap !== undefined;
  const showStacks = sv.stacks !== undefined;

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-sv-field="name" value="${sv.name}"></div>
      <div class="form-row"><label>Description</label><textarea data-sv-field="desc">${sv.desc || ''}</textarea></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Mechanics</div>
      <div class="form-row"><label>Tick kind</label><select data-sv-field="tickKind">${tickOpts}</select></div>
      <div class="form-row"><label>Duration (turns)</label><input type="number" data-sv-num="turns" value="${sv.turns ?? 0}" min="0"></div>
      ${showPpt ? `<div class="form-row"><label>% per turn</label><input type="number" data-sv-pct="percentPerTurn" value="${Math.round((sv.percentPerTurn ?? 0) * 1000) / 10}" step="0.1" min="0" max="100"></div>` : ''}
      ${showSwap ? `<div class="form-row"><label>% on swap-out</label><input type="number" data-sv-pct="percentOnSwap" value="${Math.round((sv.percentOnSwap ?? 0) * 1000) / 10}" step="0.1" min="0" max="100"></div>` : ''}
      ${showStacks ? `<div class="form-row"><label>Default stacks</label><input type="number" data-sv-num="stacks" value="${sv.stacks ?? 1}" min="1"></div>` : ''}
      <div class="form-row"><label>Stacking rule</label><select data-sv-field="stacking">${stackOpts}</select></div>
    </div>`;
}

// ─── Event Binding ───────────────────────────────────────────────────────────

function bindContentEvents() {
  const content = document.getElementById('content');

  // List item selection
  content.querySelectorAll('.list-item[data-idx]').forEach(el =>
    el.addEventListener('click', () => { S.monster = +el.dataset.idx; renderAll(); })
  );
  content.querySelectorAll('.list-item[data-ability]').forEach(el =>
    el.addEventListener('click', () => { S.ability = el.dataset.ability; renderAll(); })
  );
  content.querySelectorAll('.list-item[data-passive]').forEach(el =>
    el.addEventListener('click', () => { S.passive = el.dataset.passive; renderAll(); })
  );
  content.querySelectorAll('.list-item[data-status]').forEach(el =>
    el.addEventListener('click', () => { S.status = el.dataset.status; renderAll(); })
  );

  // Search inputs
  ['monsters','abilities','passives','statuses'].forEach(t => {
    const inp = document.getElementById(`search-${t}`);
    if (inp) inp.addEventListener('input', e => { S.search[t] = e.target.value; renderContent(); });
  });

  // Ability sort dropdown
  const sortSel = document.getElementById('sort-abilities');
  if (sortSel) sortSel.addEventListener('change', e => { S.search.abilitySort = e.target.value; renderContent(); });

  // Kind filter buttons (Abilities tab)
  content.querySelectorAll('.kind-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => { S.search.abilityKind = btn.dataset.kind; renderContent(); })
  );

  if (S.tab === 'monsters' && S.monster !== null) bindMonsterFormEvents();
  if (S.tab === 'abilities' && S.ability) bindAbilityFormEvents();
  if (S.tab === 'passives' && S.passive) bindPassiveFormEvents();
  if (S.tab === 'statuses' && S.status) bindStatusFormEvents();
}

function bindMonsterFormEvents() {
  const t = S.templates[S.monster];

  // Simple text/select/checkbox fields
  document.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const field = el.dataset.field;
      if (el.type === 'checkbox') t[field] = el.checked;
      else t[field] = el.value;
      // Refresh portrait when type changes
      if (field === 'type') renderContent();
      else { S.dirty.templates = true; renderHeader(); renderTabs(); }
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
  });

  // Base stats
  document.querySelectorAll('[data-stat-base]').forEach(el => {
    el.addEventListener('change', () => {
      t.baseStats[el.dataset.statBase] = +el.value;
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
  });

  // Growth rates
  document.querySelectorAll('[data-stat-growth]').forEach(el => {
    el.addEventListener('change', () => {
      t.growth[el.dataset.statGrowth] = parseFloat(el.value);
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
  });

  // Ability pool chips — click to toggle, long-press to navigate
  document.querySelectorAll('.chip[data-ability-key]').forEach(chip => {
    chip.addEventListener('click', () => {
      const k = chip.dataset.abilityKey;
      const idx = t.abilityPool.indexOf(k);
      if (idx === -1) t.abilityPool.push(k);
      else t.abilityPool.splice(idx, 1);
      chip.classList.toggle('active', t.abilityPool.includes(k));
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
    longPress(chip, () => {
      S.tab = 'abilities'; S.ability = chip.dataset.abilityKey; renderAll();
    });
  });

  // Long-press on passive selects → navigate to that passive
  ['[data-field="primaryPassive"]', '[data-field="secondaryPassive"]'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    longPress(el, () => {
      S.tab = 'passives'; S.passive = el.value; renderAll();
    });
  });
}

function bindAbilityFormEvents() {
  const ab = S.abilities[S.ability];

  document.querySelectorAll('[data-ab-field]').forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.abField;
      if (f === 'healPercent' || f === 'healOnSwap') {
        const v = parseFloat(el.value) / 100;
        if (v === 0) delete ab[f]; else ab[f] = parseFloat(v.toFixed(4));
      } else if (f === 'power' || f === 'hits' || f === 'priority' || f === 'healTurns') {
        const v = parseInt(el.value);
        if (v === 0 || v === 1 && f === 'hits') delete ab[f]; else ab[f] = v;
      } else if (f === 'element' || f === 'effect') {
        if (el.value === '') delete ab[f]; else ab[f] = el.value;
      } else {
        ab[f] = el.value;
      }
      if (f === 'kind') renderContent(); // re-render form for field visibility
      else { S.dirty.abilities = true; renderHeader(); renderTabs(); }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-ab-statmult]').forEach(el => {
    el.addEventListener('change', () => {
      if (!ab.statMult) ab.statMult = {};
      const v = parseFloat(el.value);
      if (v === 0) delete ab.statMult[el.dataset.abStatmult];
      else ab.statMult[el.dataset.abStatmult] = v;
      if (Object.keys(ab.statMult).length === 0) delete ab.statMult;
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-ab-buffswap]').forEach(el => {
    el.addEventListener('change', () => {
      if (!ab.buffOnSwap) ab.buffOnSwap = {};
      const v = parseFloat(el.value);
      if (v === 0) delete ab.buffOnSwap[el.dataset.abBuffswap];
      else ab.buffOnSwap[el.dataset.abBuffswap] = v;
      if (Object.keys(ab.buffOnSwap).length === 0) delete ab.buffOnSwap;
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // Status effects — add row
  const seAdd = document.getElementById('se-add');
  if (seAdd) {
    seAdd.addEventListener('click', () => {
      if (!ab.statusEffects) ab.statusEffects = [];
      const firstKey = Object.keys(S.statuses)[0] || '';
      ab.statusEffects.push({ status: firstKey, targets: [] });
      S.dirty.abilities = true;
      renderContent();
    });
  }

  // Status effects — remove row
  document.querySelectorAll('[data-se-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.seRemove;
      (ab.statusEffects || []).splice(i, 1);
      if (ab.statusEffects && ab.statusEffects.length === 0) delete ab.statusEffects;
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // Status effects — status select
  document.querySelectorAll('[data-se-status]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.seStatus;
      ab.statusEffects[i].status = sel.value;
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // Status effects — target checkboxes
  document.querySelectorAll('[data-se-target]').forEach(cb => {
    cb.addEventListener('change', () => {
      const i = +cb.dataset.seTarget;
      const tgt = cb.dataset.tgt;
      const se = ab.statusEffects[i];
      if (!se.targets) se.targets = [];
      if (cb.checked) { if (!se.targets.includes(tgt)) se.targets.push(tgt); }
      else { se.targets = se.targets.filter(t => t !== tgt); }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  bindAdditionalEffectsEvents(ab);
}

function makeAeInst(type) {
  const schema = S.additionalEffects[type] || { params: {} };
  const inst = { type };
  for (const [pk, ps] of Object.entries(schema.params || {})) {
    const d = ps.default;
    inst[pk] = Array.isArray(d) ? [...d] : d;
  }
  return inst;
}

// Per-instance, schema-driven additional effects handlers.
function bindAdditionalEffectsEvents(ab) {
  const addBtn = document.getElementById('ae-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const type = Object.keys(S.additionalEffects)[0];
      if (!type) return;
      if (!ab.additionalEffects) ab.additionalEffects = [];
      ab.additionalEffects.push(makeAeInst(type));
      S.dirty.abilities = true;
      renderContent();
    });
  }

  document.querySelectorAll('[data-ae-type-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.aeTypeSel;
      ab.additionalEffects[i] = makeAeInst(sel.value);
      S.dirty.abilities = true;
      renderContent();
    });
  });

  document.querySelectorAll('[data-ae-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.aeRemove;
      (ab.additionalEffects || []).splice(i, 1);
      if (ab.additionalEffects && ab.additionalEffects.length === 0) delete ab.additionalEffects;
      S.dirty.abilities = true;
      renderContent();
    });
  });

  document.querySelectorAll('[data-ae-param]').forEach(el => {
    el.addEventListener('change', () => {
      const i      = +el.dataset.aeRow;
      const paramK = el.dataset.aeParam;
      const ptype  = el.dataset.aePtype;
      const eff    = ab.additionalEffects[i];
      if (!eff) return;
      if (ptype === 'percent') {
        eff[paramK] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      } else if (ptype === 'multiplier') {
        eff[paramK] = parseFloat(el.value);
      } else if (ptype === 'bool') {
        eff[paramK] = el.checked;
      } else if (ptype === 'status') {
        eff[paramK] = el.value;
      } else if (ptype === 'targets' || ptype === 'swapTargets') {
        const tgt = el.dataset.aeTgt;
        if (!Array.isArray(eff[paramK])) eff[paramK] = [];
        if (el.checked) { if (!eff[paramK].includes(tgt)) eff[paramK].push(tgt); }
        else { eff[paramK] = eff[paramK].filter(t => t !== tgt); }
      }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });
}

function bindStatusFormEvents() {
  const sv = S.statuses[S.status];

  document.querySelectorAll('[data-sv-field]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svField] = el.value;
      if (el.dataset.svField === 'tickKind') renderContent(); // refresh % fields visibility
      else { S.dirty.statuses = true; renderHeader(); renderTabs(); }
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-sv-num]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svNum] = +el.value;
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });

  // pct fields are stored as 0.0–1.0 but displayed as 0–100
  document.querySelectorAll('[data-sv-pct]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svPct] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });
}

function bindPassiveFormEvents() {
  const pv = S.passives[S.passive];

  document.querySelectorAll('[data-pv-field]').forEach(el => {
    el.addEventListener('change', () => {
      pv[el.dataset.pvField] = el.value;
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-pv-param]').forEach(el => {
    el.addEventListener('change', () => {
      pv[el.dataset.pvParam] = parseFloat(el.value);
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-pv-param-str]').forEach(el => {
    el.addEventListener('change', () => {
      pv[el.dataset.pvParamStr] = el.value;
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-pv-array]').forEach(el => {
    el.addEventListener('change', () => {
      pv[el.dataset.pvArray] = el.value.split(',').map(s => s.trim()).filter(Boolean);
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });
}

// ─── Long-press ──────────────────────────────────────────────────────────────

function longPress(el, cb) {
  let timer;
  el.addEventListener('pointerdown', () => { timer = setTimeout(() => { cb(); timer = null; }, 500); });
  el.addEventListener('pointerup',   () => clearTimeout(timer));
  el.addEventListener('pointermove', () => clearTimeout(timer));
  el.addEventListener('pointerleave',() => clearTimeout(timer));
}

// ─── GitHub Commit ───────────────────────────────────────────────────────────

function openCommitModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const dirtyNames = Object.entries(S.dirty).filter(([, v]) => v).map(([k]) => k).join(', ');
  overlay.innerHTML = `
    <div class="modal">
      <h3>Commit to GitHub</h3>
      <p style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Files to commit: ${dirtyNames}</p>
      <textarea id="commit-msg" rows="2" placeholder="Commit message">chore: designer edits via editor tool</textarea>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-confirm">Commit</button>
      </div>
    </div>`;
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('modal-confirm').addEventListener('click', () => doCommit(document.getElementById('commit-msg').value));
}

async function doCommit(message) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal"><p style="padding:10px">Committing…</p></div>`;
  S.statusMsg = ''; S.statusError = false;

  if (!S.pat) { showStatus('Enter a GitHub PAT first.', true); overlay.classList.add('hidden'); return; }

  const toCommit = [
    S.dirty.templates  && { file: 'templates.json',      data: S.templates },
    S.dirty.abilities  && { file: 'abilities.json',       data: S.abilities },
    S.dirty.passives   && { file: 'passives.json',        data: S.passives },
    S.dirty.statuses   && { file: 'statuseffects.json',   data: S.statuses },
  ].filter(Boolean);

  try {
    for (const { file, data } of toCommit) {
      const sha = await getFileSha(file);
      await putFile(file, data, sha, message);
    }
    S.dirty = { abilities: false, passives: false, templates: false, statuses: false };
    showStatus('Committed! Pages will rebuild shortly.', false);
  } catch (e) {
    showStatus(`Commit failed: ${e.message}`, true);
  }
  overlay.classList.add('hidden');
  renderAll();
}

async function getFileSha(filename) {
  const url = `https://api.github.com/repos/pvaiun/TamerGame/contents/data/${filename}?ref=${encodeURIComponent(S.branch)}`;
  const res = await fetch(url, { headers: { Authorization: `token ${S.pat}`, Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`Can't read ${filename}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.sha;
}

async function putFile(filename, data, sha, message) {
  const content = toBase64(JSON.stringify(data, null, 2) + '\n');
  const url = `https://api.github.com/repos/pvaiun/TamerGame/contents/data/${filename}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `token ${S.pat}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, sha, branch: S.branch }),
  });
  if (!res.ok) throw new Error(`Failed to write ${filename}: ${res.status} ${await res.text()}`);
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function showStatus(msg, isError) {
  S.statusMsg = msg;
  S.statusError = isError;
  renderHeader();
  if (!isError) setTimeout(() => { S.statusMsg = ''; renderHeader(); }, 5000);
}

// ─── Start ───────────────────────────────────────────────────────────────────

init();
