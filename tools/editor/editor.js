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
  search: { monsters: '', abilities: '', passives: '', statuses: '', abilityElement: '', abilitySort: 'name' },
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

// Per-tab scroll positions for the list panel — preserved across re-renders
// triggered by selection, search, sort, etc. Tab switches still surface the
// last scroll position for the new tab.
const scrollPositions = { monsters: 0, abilities: 0, passives: 0, statuses: 0 };

function renderContent() {
  const el = document.getElementById('content');
  // Save current list scroll under whichever tab was last rendered.
  const lastTab = el.dataset.scrollTab;
  if (lastTab) {
    const cur = el.querySelector('.list-items');
    if (cur) scrollPositions[lastTab] = cur.scrollTop;
  }
  if (S.tab === 'monsters')  el.innerHTML = monstersTabHTML();
  if (S.tab === 'abilities') el.innerHTML = abilitiesTabHTML();
  if (S.tab === 'passives')  el.innerHTML = passivesTabHTML();
  if (S.tab === 'statuses')  el.innerHTML = statusEffectsTabHTML();
  el.dataset.scrollTab = S.tab;
  const newList = el.querySelector('.list-items');
  if (newList) newList.scrollTop = scrollPositions[S.tab] || 0;
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

// Letter grade thresholds mirror src/creature.js growthRank().
const GROWTH_GRADES = [
  { grade: 'S', min: 2.6, mid: 2.8 },
  { grade: 'A', min: 2.2, mid: 2.4 },
  { grade: 'B', min: 1.8, mid: 2.0 },
  { grade: 'C', min: 1.4, mid: 1.6 },
  { grade: 'D', min: 1.0, mid: 1.2 },
  { grade: 'E', min: 0.6, mid: 0.8 },
  { grade: 'F', min: 0,   mid: 0.4 },
];
function growthGrade(v) {
  for (const g of GROWTH_GRADES) if (v >= g.min) return g.grade;
  return 'F';
}
function growthMidpoint(grade) {
  return (GROWTH_GRADES.find(g => g.grade === grade) || GROWTH_GRADES[6]).mid;
}

function passiveOption(p, k, selected) {
  const desc = (p.desc || '').replace(/"/g, '&quot;');
  // Append the full first sentence so users see what each passive does at a glance.
  const short = (p.desc || '').split(/[.\n]/)[0].trim();
  return `<option value="${k}" title="${desc}" ${selected ? 'selected' : ''}>${p.name}${short ? ' — ' + short : ''}</option>`;
}

function monsterFormHTML(t) {
  const passiveOpts  = Object.entries(S.passives).map(([k, p]) => passiveOption(p, k, t.primaryPassive === k)).join('');
  const passiveOpts2 = Object.entries(S.passives).map(([k, p]) => passiveOption(p, k, t.secondaryPassive === k)).join('');
  const typeOpts = S.types.map(ty =>
    `<option value="${ty}" ${t.type === ty ? 'selected' : ''}>${ty}</option>`).join('');

  const palette = S.typePalette[t.type] || { primary: '#666', secondary: '#888', accent: '#aaa', dark: '#333' };
  const gen = ART_GENERATORS[t.species];
  const svgHTML = gen ? gen(palette) : '<svg viewBox="0 0 120 100"><circle cx="60" cy="60" r="20" fill="#666"/></svg>';

  // Ability pool — render each entry as a row with a select dropdown + remove button,
  // mirroring the +Add UX used for ability effects. Duplicates are filtered from
  // each row's options (except for the row's own current selection).
  const pool = t.abilityPool || [];
  const allAbilityKeys = Object.keys(S.abilities)
    .sort((a, b) => S.abilities[a].name.localeCompare(S.abilities[b].name));
  const poolRows = pool.map((k, i) => {
    const ab = S.abilities[k];
    const pipClass = `type-pip ${ab?.element || 'neutral'}`;
    const opts = allAbilityKeys
      .filter(ak => ak === k || !pool.includes(ak))
      .map(ak => {
        const a2 = S.abilities[ak];
        const short = (a2.desc || '').split(/[.\n]/)[0].trim();
        const titleAttr = (a2.desc || '').replace(/"/g, '&quot;');
        return `<option value="${ak}" title="${titleAttr}" ${ak === k ? 'selected' : ''}>${a2.name}${short ? ' — ' + short : ''}</option>`;
      }).join('');
    return `
      <div class="ae-row" data-pool-idx="${i}">
        <div class="ae-row-head">
          <span class="${pipClass}" data-pool-pip="${i}" style="flex-shrink:0"></span>
          <select data-pool-sel="${i}">${opts}</select>
          <button class="btn-icon" data-pool-remove="${i}" title="Remove from pool">✕</button>
        </div>
      </div>`;
  }).join('');
  const canAdd = allAbilityKeys.some(k => !pool.includes(k));

  // Growth rate cells: numeric input + grade select. Editing either updates the other.
  const growthCells = ['hp','atk','def','spd'].map(s => {
    const v = t.growth[s];
    const grade = growthGrade(v);
    const gradeOpts = GROWTH_GRADES.map(g => `<option value="${g.grade}" ${g.grade === grade ? 'selected' : ''}>${g.grade}</option>`).join('');
    return `
      <div class="stat-cell">
        <label>${s.toUpperCase()}</label>
        <div class="growth-cell">
          <input type="number" data-stat-growth="${s}" value="${v}" step="0.1" min="0" max="3.5">
          <select data-stat-grade="${s}" class="growth-grade grade-${grade}">${gradeOpts}</select>
        </div>
      </div>`;
  }).join('');

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
      <div class="stat-grid stat-grid-narrow">
        ${['hp','atk','def','spd'].map(s => `
          <div class="stat-cell">
            <label>${s.toUpperCase()}</label>
            <input type="number" data-stat-base="${s}" value="${t.baseStats[s]}" min="1">
          </div>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Growth Rates
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">(set the number or pick a grade)</span>
      </div>
      <div class="stat-grid stat-grid-narrow">${growthCells}</div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Passives</div>
      <div class="form-row"><label>Primary</label><select data-field="primaryPassive">${passiveOpts}</select></div>
      <div class="form-row"><label>Secondary</label><select data-field="secondaryPassive">${passiveOpts2}</select></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Ability Pool</div>
      <div id="pool-list">${poolRows}</div>
      <button class="btn btn-secondary btn-sm" id="pool-add" ${canAdd ? '' : 'disabled'}>+ Add ability</button>
    </div>`;
}

// ─── Abilities Tab ───────────────────────────────────────────────────────────

function abilitiesTabHTML() {
  const q   = S.search.abilities.toLowerCase();
  const ef  = S.search.abilityElement;
  const srt = S.search.abilitySort;
  const totalDamage = (a) => (a.phases || []).flat()
    .filter(e => e.type === 'damage')
    .reduce((s, e) => s + (e.power || 0) * (e.hits || 1), 0);
  const phaseCount  = (a) => (a.phases ? a.phases.length : 0);
  const hasDamage   = (a) => (a.phases || []).flat().some(e => e.type === 'damage');

  const entries = Object.entries(S.abilities)
    .filter(([k, a]) => (!ef || a.element === ef) && (!q || a.name.toLowerCase().includes(q) || k.includes(q)))
    .sort((a, b) => {
      if (srt === 'element') {
        const ea = a[1].element || '', eb = b[1].element || '';
        return ea.localeCompare(eb) || a[1].name.localeCompare(b[1].name);
      }
      if (srt === 'power') return totalDamage(b[1]) - totalDamage(a[1]);
      return a[1].name.localeCompare(b[1].name);
    });

  const listHTML = entries.map(([k, a]) => {
    const dmg = totalDamage(a);
    const subParts = [];
    if (phaseCount(a) > 1) subParts.push(`${phaseCount(a)} phases`);
    if (hasDamage(a)) subParts.push(`pow ${dmg}`);
    const pipClass = a.element ? `type-pip ${a.element}` : 'type-pip neutral';
    return `
      <div class="list-item ${S.ability === k ? 'selected' : ''}" data-ability="${k}">
        <span class="${pipClass}"></span>
        <div style="flex:1; min-width:0;">
          <div class="list-item-name">${a.name}</div>
          <div class="list-item-sub">${subParts.join(' · ') || k}</div>
        </div>
        <button class="btn-icon list-item-delete" data-delete-ability="${k}" title="Delete ability">✕</button>
      </div>`;
  }).join('');

  const elemFilters = [['', 'All'], ...S.types.map(t => [t, t])];
  const filterBtns = elemFilters.map(([key, label]) =>
    `<button class="kind-filter-btn ${ef === key ? 'active' : ''}" data-element="${key}">${label}</button>`
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
      <button class="btn btn-secondary btn-sm" id="ability-new" style="margin: 6px 8px;">+ New ability</button>
    </div>
    <div class="detail-panel">${ab ? abilityFormHTML(S.ability, ab) : '<div class="empty">Select an ability to edit.</div>'}</div>`;
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

function aeParamHTML(phaseIdx, effIdx, paramKey, schema, current) {
  const dataAttr = `data-ae-param="${paramKey}" data-ae-row="${effIdx}" data-ae-phase="${phaseIdx}"`;
  const label = schema.label || paramKey;
  if (schema.type === 'percent') {
    const v = Math.round((current ?? 0) * 1000) / 10;
    return `<label class="ae-param"><span>${label} %</span><input type="number" ${dataAttr} data-ae-ptype="percent" value="${v}" step="0.1" min="0" max="100"></label>`;
  }
  if (schema.type === 'multiplier') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} data-ae-ptype="multiplier" value="${current ?? 1}" step="0.05" min="0"></label>`;
  }
  if (schema.type === 'int') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} data-ae-ptype="int" value="${current ?? 0}" step="1" min="0"></label>`;
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
  if (schema.type === 'statMods') {
    const v = current || {};
    const cells = ['atk', 'def', 'spd'].map(s =>
      `<div class="stat-cell"><label>${s.toUpperCase()}</label>
        <input type="number" ${dataAttr} data-ae-ptype="statMods" data-ae-stat="${s}"
          value="${v[s] ?? 0}" step="0.05"></div>`).join('');
    return `<div class="ae-param ae-statmods"><span>${label}</span><div class="stat-grid">${cells}</div></div>`;
  }
  return '';
}

// Render a single effect row inside a phase. `phaseIdx` and `effIdx` are passed
// through to all data-* attributes so binders know which phase/effect to mutate.
function effectRowHTML(eff, phaseIdx, effIdx) {
  const typeKeys = Object.keys(S.additionalEffects);
  const schema = S.additionalEffects[eff.type] || { label: eff.type, params: {} };
  const params = schema.params || {};
  const paramRows = Object.entries(params)
    .map(([pk, ps]) => aeParamHTML(phaseIdx, effIdx, pk, ps, aeParamCurrent(eff, pk, ps)))
    .join('');
  const typeOpts = typeKeys.map(k => {
    const s = S.additionalEffects[k];
    const short = (s?.desc || '').split(/[.\n]/)[0].trim();
    return `<option value="${k}" ${eff.type === k ? 'selected' : ''}>${s?.label || k}${short ? ' — ' + short : ''}</option>`;
  }).join('');
  const desc = (schema.desc || '').replace(/"/g, '&quot;');

  // Timing override: only meaningful for non-modifier effects.
  let timingHTML = '';
  if (!schema.modifier && eff.type !== 'damage') {
    const def = schema.defaultTiming || 'after';
    const cur = eff.timing || def;
    const tOpts = ['before', 'eachHit', 'after'].map(t =>
      `<option value="${t}" ${cur === t ? 'selected' : ''}>${t}${t === def ? ' (default)' : ''}</option>`
    ).join('');
    timingHTML = `<label class="ae-param ae-timing"><span>Timing</span>
      <select data-ae-timing data-ae-row="${effIdx}" data-ae-phase="${phaseIdx}">${tOpts}</select></label>`;
  }

  // Dependency warning if `requires` is unmet within the current phase.
  let warning = '';
  const requires = schema.requires || [];
  if (requires.length) {
    const phaseTypes = new Set((S.abilities[S.ability].phases[phaseIdx] || []).map(e => e.type));
    const missing = requires.filter(r => !phaseTypes.has(r));
    if (missing.length) {
      warning = `<div class="ae-warn">⚠ needs ${missing.join(', ')} in this phase</div>`;
    }
  }

  return `
    <div class="ae-row" data-ae-idx="${effIdx}" data-ae-phase="${phaseIdx}">
      <div class="ae-row-head">
        <select data-ae-type-sel="${effIdx}" data-ae-phase="${phaseIdx}" title="${desc}">${typeOpts}</select>
        <button class="btn-icon" data-ae-remove="${effIdx}" data-ae-phase="${phaseIdx}">✕</button>
      </div>
      ${paramRows || timingHTML ? `<div class="ae-row-params">${paramRows}${timingHTML}</div>` : ''}
      ${warning}
    </div>`;
}

function phaseFormHTML(phase, phaseIdx, totalPhases) {
  const rows = phase.map((eff, i) => effectRowHTML(eff, phaseIdx, i)).join('');
  const phaseLabel = totalPhases > 1 ? `Phase ${phaseIdx + 1}` : 'Effects';
  const removeBtn = totalPhases > 1
    ? `<button class="btn-icon" data-phase-remove="${phaseIdx}" title="Remove this phase">✕</button>` : '';
  return `
    <div class="phase-block" data-phase-idx="${phaseIdx}">
      <div class="phase-head">
        <span class="phase-label">${phaseLabel}</span>
        ${removeBtn}
      </div>
      <div class="ae-list">${rows}</div>
      <button class="btn btn-secondary btn-sm" data-effect-add="${phaseIdx}">+ Add effect</button>
    </div>`;
}

function abilityFormHTML(key, ab) {
  const typeOpts = ['', ...S.types].map(t =>
    `<option value="${t}" ${(ab.element || '') === t ? 'selected' : ''}>${t || '(none)'}</option>`).join('');
  const phases = ab.phases && ab.phases.length ? ab.phases : [[]];
  const phaseHTML = phases.map((p, i) => phaseFormHTML(p, i, phases.length)).join('');

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-ab-field="name" value="${ab.name}"></div>
      <div class="form-row"><label>Description</label><textarea data-ab-field="desc">${ab.desc || ''}</textarea></div>
      <div class="form-row"><label>Element</label><select data-ab-field="element">${typeOpts}</select></div>
      <div class="form-row"><label>Priority</label><input type="number" data-ab-field="priority" value="${ab.priority ?? 0}" min="-3" max="3"></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Phases
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">
          (multi-phase abilities resolve one phase per turn; subsequent phases queue up automatically)</span>
      </div>
      ${phaseHTML}
      <button class="btn btn-secondary btn-sm" id="phase-add">+ Add phase</button>
    </div>`;
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
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-ability]')) return;
      S.ability = el.dataset.ability; renderAll();
    })
  );
  content.querySelectorAll('[data-delete-ability]').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = btn.dataset.deleteAbility;
      const ab = S.abilities[k];
      if (!ab) return;
      // Find templates that reference this ability so we can warn the user.
      const referencing = (S.templates || [])
        .filter(t => (t.abilityPool || []).includes(k))
        .map(t => t.species);
      const refMsg = referencing.length
        ? `\n\nWill remove from ${referencing.length} monster pool${referencing.length > 1 ? 's' : ''}: ${referencing.join(', ')}.`
        : '';
      if (!confirm(`Delete ability "${ab.name}" (${k})?${refMsg}`)) return;
      delete S.abilities[k];
      for (const t of S.templates) {
        if (!t.abilityPool) continue;
        t.abilityPool = t.abilityPool.filter(x => x !== k);
      }
      if (S.ability === k) S.ability = null;
      S.dirty.abilities = true;
      S.dirty.templates = referencing.length > 0 || S.dirty.templates;
      renderAll();
    })
  );
  const newAbilityBtn = content.querySelector('#ability-new');
  if (newAbilityBtn) {
    newAbilityBtn.addEventListener('click', () => {
      const raw = prompt('New ability key (lowercase, snake_case):', '');
      if (raw === null) return;
      const key = raw.trim();
      if (!key) return;
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        alert('Key must start with a lowercase letter and contain only lowercase letters, digits, or underscores.');
        return;
      }
      if (S.abilities[key]) { alert(`"${key}" already exists.`); return; }
      const niceName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      S.abilities[key] = {
        name: niceName,
        desc: '',
        priority: 0,
        phases: [[ { type: 'damage', power: 50 } ]],
      };
      S.ability = key;
      S.dirty.abilities = true;
      renderAll();
    });
  }
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

  // Element filter buttons (Abilities tab)
  content.querySelectorAll('.kind-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => { S.search.abilityElement = btn.dataset.element || ''; renderContent(); })
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
      // Type changes affect the portrait; passive changes need to refresh the
      // inline description block. Both go through renderContent.
      if (field === 'type' || field === 'primaryPassive' || field === 'secondaryPassive') renderContent();
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

  // Growth rate (numeric) — also refresh the linked grade chip.
  document.querySelectorAll('[data-stat-growth]').forEach(el => {
    el.addEventListener('change', () => {
      const stat = el.dataset.statGrowth;
      t.growth[stat] = parseFloat(el.value) || 0;
      S.dirty.templates = true;
      renderContent();
    });
  });
  // Growth rate (letter grade) — snap value to the midpoint of the chosen grade.
  document.querySelectorAll('[data-stat-grade]').forEach(el => {
    el.addEventListener('change', () => {
      const stat = el.dataset.statGrade;
      t.growth[stat] = growthMidpoint(el.value);
      S.dirty.templates = true;
      renderContent();
    });
  });

  // Ability pool — add row (picks the first ability not already in pool).
  const poolAdd = document.getElementById('pool-add');
  if (poolAdd) {
    poolAdd.addEventListener('click', () => {
      if (!t.abilityPool) t.abilityPool = [];
      const next = Object.keys(S.abilities)
        .sort((a, b) => S.abilities[a].name.localeCompare(S.abilities[b].name))
        .find(k => !t.abilityPool.includes(k));
      if (!next) return;
      t.abilityPool.push(next);
      S.dirty.templates = true;
      renderContent();
    });
  }
  // Ability pool — change selection in a row.
  document.querySelectorAll('[data-pool-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.poolSel;
      t.abilityPool[i] = sel.value;
      const pip = document.querySelector(`[data-pool-pip="${i}"]`);
      if (pip) pip.className = `type-pip ${S.abilities[sel.value]?.element || 'neutral'}`;
      S.dirty.templates = true;
      renderContent();
    });
    // Long-press jumps to the selected ability for editing.
    longPress(sel, () => {
      S.tab = 'abilities'; S.ability = sel.value; renderAll();
    });
  });
  // Ability pool — remove row.
  document.querySelectorAll('[data-pool-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.poolRemove;
      t.abilityPool.splice(i, 1);
      S.dirty.templates = true;
      renderContent();
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
  if (!ab.phases) ab.phases = [[]];

  // Identity fields (name, desc, element, priority)
  document.querySelectorAll('[data-ab-field]').forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.abField;
      if (f === 'priority') {
        const v = parseInt(el.value);
        if (v === 0) delete ab[f]; else ab[f] = v;
      } else if (f === 'element') {
        if (el.value === '') delete ab[f]; else ab[f] = el.value;
      } else {
        ab[f] = el.value;
      }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // ── Phase add / remove ─────────────────────────────────────────────────
  const phaseAdd = document.getElementById('phase-add');
  if (phaseAdd) {
    phaseAdd.addEventListener('click', () => {
      if (!ab.phases) ab.phases = [[]];
      ab.phases.push([]);
      S.dirty.abilities = true;
      renderContent();
    });
  }
  document.querySelectorAll('[data-phase-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.phaseRemove;
      ab.phases.splice(i, 1);
      if (ab.phases.length === 0) ab.phases = [[]];
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect add (per phase) ─────────────────────────────────────────────
  document.querySelectorAll('[data-effect-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pi = +btn.dataset.effectAdd;
      const firstType = Object.keys(S.additionalEffects)[0];
      if (!firstType) return;
      ab.phases[pi].push(makeAeInst(firstType));
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect remove ──────────────────────────────────────────────────────
  document.querySelectorAll('[data-ae-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pi = +btn.dataset.aePhase;
      const i  = +btn.dataset.aeRemove;
      ab.phases[pi].splice(i, 1);
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect type change (replaces the instance with fresh defaults) ──
  document.querySelectorAll('[data-ae-type-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const pi = +sel.dataset.aePhase;
      const i  = +sel.dataset.aeTypeSel;
      ab.phases[pi][i] = makeAeInst(sel.value);
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Per-effect timing override ──────────────────────────────────────────
  document.querySelectorAll('[data-ae-timing]').forEach(sel => {
    sel.addEventListener('change', () => {
      const pi = +sel.dataset.aePhase;
      const i  = +sel.dataset.aeRow;
      const eff = ab.phases[pi][i];
      const schema = S.additionalEffects[eff.type] || {};
      if (sel.value === schema.defaultTiming) delete eff.timing;
      else eff.timing = sel.value;
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // ── Per-param edits ────────────────────────────────────────────────────
  document.querySelectorAll('[data-ae-param]').forEach(el => {
    el.addEventListener('change', () => {
      const pi    = +el.dataset.aePhase;
      const i     = +el.dataset.aeRow;
      const paramK = el.dataset.aeParam;
      const ptype  = el.dataset.aePtype;
      const eff    = ab.phases[pi][i];
      if (!eff) return;
      if (ptype === 'percent') {
        eff[paramK] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      } else if (ptype === 'multiplier') {
        eff[paramK] = parseFloat(el.value);
      } else if (ptype === 'int') {
        eff[paramK] = parseInt(el.value) || 0;
      } else if (ptype === 'bool') {
        eff[paramK] = el.checked;
      } else if (ptype === 'status') {
        eff[paramK] = el.value;
      } else if (ptype === 'targets' || ptype === 'swapTargets') {
        const tgt = el.dataset.aeTgt;
        if (!Array.isArray(eff[paramK])) eff[paramK] = [];
        if (el.checked) { if (!eff[paramK].includes(tgt)) eff[paramK].push(tgt); }
        else { eff[paramK] = eff[paramK].filter(t => t !== tgt); }
      } else if (ptype === 'statMods') {
        const stat = el.dataset.aeStat;
        if (!eff[paramK] || typeof eff[paramK] !== 'object') eff[paramK] = {};
        const v = parseFloat(el.value);
        eff[paramK][stat] = v;
      }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });
}

function makeAeInst(type) {
  const schema = S.additionalEffects[type] || { params: {} };
  const inst = { type };
  for (const [pk, ps] of Object.entries(schema.params || {})) {
    const d = ps.default;
    if (d === undefined) continue;
    if (Array.isArray(d))                          inst[pk] = [...d];
    else if (d !== null && typeof d === 'object')  inst[pk] = { ...d };
    else                                           inst[pk] = d;
  }
  return inst;
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
