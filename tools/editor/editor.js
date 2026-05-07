import { ART_GENERATORS } from '../../src/art.js';

// ─── State ───────────────────────────────────────────────────────────────────

const S = {
  abilities: {}, passives: {}, templates: [], types: [], typePalette: {},
  dirty: { abilities: false, passives: false, templates: false },
  tab: 'monsters',
  monster: null,   // selected template index
  ability: null,   // selected ability key
  passive: null,   // selected passive key
  pat: '', branch: 'main',
  statusMsg: '', statusError: false,
  search: { monsters: '', abilities: '', passives: '', abilityKind: '' },
};

// ─── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [types, passives, abilities, templates] = await Promise.all([
      fetch('../../data/types.json').then(r => r.json()),
      fetch('../../data/passives.json').then(r => r.json()),
      fetch('../../data/abilities.json').then(r => r.json()),
      fetch('../../data/templates.json').then(r => r.json()),
    ]);
    S.types = types.TYPES;
    S.typePalette = types.TYPE_PALETTE;
    S.passives = passives;
    S.abilities = abilities;
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
    { key: 'monsters',  label: 'Monsters',  dirty: S.dirty.templates },
    { key: 'abilities', label: 'Abilities', dirty: S.dirty.abilities },
    { key: 'passives',  label: 'Passives',  dirty: S.dirty.passives },
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
  const q = S.search.abilities.toLowerCase();
  const kf = S.search.abilityKind;
  const entries = Object.entries(S.abilities)
    .filter(([k, a]) => (!kf || a.kind === kf) && (!q || a.name.toLowerCase().includes(q) || k.includes(q)))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const listHTML = entries.map(([k, a]) => `
    <div class="list-item ${S.ability === k ? 'selected' : ''}" data-ability="${k}">
      <div>
        <div class="list-item-name">${a.name}</div>
        <div class="list-item-sub">${a.kind}${a.element ? ' · ' + a.element : ''}</div>
      </div>
    </div>`).join('');

  const filterBtns = KIND_FILTERS.map(f =>
    `<button class="kind-filter-btn ${kf === f.key ? 'active' : ''}" data-kind="${f.key}">${f.label}</button>`
  ).join('');

  const ab = S.ability ? S.abilities[S.ability] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-abilities" placeholder="Search…" value="${S.search.abilities}"></div>
      <div class="kind-filter">${filterBtns}</div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${ab ? abilityFormHTML(S.ability, ab) : '<div class="empty">Select an ability to edit.</div>'}</div>`;
}

const EFFECTS = {
  burn:             'Apply Burn (4t · 5%/t)',
  burn_stacking:    'Apply Burn (stacking · +2t each)',
  burn_long:        'Apply Burn (6t · 5%/t)',
  burn_both:        'Apply Burn — target + own bench',
  soaking:          'Apply Soaking (1 stack)',
  soaking_double:   'Apply Soaking (2 stacks)',
  dazed:            'Apply Dazed (2t)',
  dazed_long:       'Apply Dazed (4t)',
  cursed:           'Apply Cursed (30% on-swap)',
  cursed_synergy:   'Apply Cursed + bonus dmg if already cursed',
  cursed_both:      'Apply Cursed — target + own bench',
  wither_combo:     'Apply Cursed + Soaking',
  lifesteal_strong: 'Lifesteal 50% of damage dealt',
  lifesteal_full:   'Lifesteal 100% of damage dealt',
  bloom_self:       'Apply Bloom to self (4t · 5%/t)',
  bloom_self_long:  'Apply Bloom to self (6t · 6%/t)',
  bloom_both:       'Apply Bloom — self + own bench',
  execute_scale:    'Scale damage by target missing HP',
  pierce:           'Ignore 50% of target Defense',
  force_swap:       'Force-swap target active creature',
  thorn_soaking:    'Apply Soaking to attackers that hit you',
  cleanse_self:     'Cleanse self — all statuses + stat penalties',
  bench_bloom:      'Apply Bloom to bench ally (4t · 6%/t)',
  bench_buff_atk:   'Buff bench ally ATK +25%',
  bench_buff_def:   'Buff bench ally DEF +30%',
};

const EFFECTS_BY_KIND = {
  attack:        ['burn','burn_stacking','burn_long','burn_both','soaking','soaking_double','dazed','dazed_long','cursed','cursed_synergy','cursed_both','wither_combo','lifesteal_strong','lifesteal_full','bloom_self','bloom_self_long','bloom_both','execute_scale','pierce','force_swap','thorn_soaking','cleanse_self'],
  charge_attack: ['burn','burn_both','soaking','soaking_double','dazed','dazed_long','cursed','cursed_both','wither_combo','lifesteal_strong','lifesteal_full','bloom_both','execute_scale','force_swap'],
  debuff:        ['burn','burn_both','soaking','soaking_double','dazed','dazed_long','cursed','cursed_both','wither_combo','force_swap'],
  apply_heal:    ['bloom_self','bloom_both','cleanse_self'],
  bench_support: ['bench_bloom','bench_buff_atk','bench_buff_def'],
  buff:          ['cleanse_self'],
  swap_self:     [],
};

function effectSelectHTML(ab) {
  const allowed = EFFECTS_BY_KIND[ab.kind] || [];
  if (allowed.length === 0) return '';
  const opts = allowed.map(k =>
    `<option value="${k}" ${ab.effect === k ? 'selected' : ''}>${EFFECTS[k]}</option>`
  ).join('');
  return `<div class="form-row"><label>Effect</label><select data-ab-field="effect"><option value="">(no effect)</option>${opts}</select></div>`;
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
      <div class="form-row"><label>HP Cost %</label><input type="number" data-ab-field="hpCost" value="${Math.round((ab.hpCost ?? 0) * 100)}" min="0" max="100"></div>
      ${effectSelectHTML(ab)}
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
      ${effectSelectHTML(ab)}
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
    ${!isAttack && !isBuff && !isHeal && !isSwap ? `
    <div class="form-section">
      ${effectSelectHTML(ab)}
    </div>` : ''}`;
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

  // Search inputs
  ['monsters','abilities','passives'].forEach(t => {
    const inp = document.getElementById(`search-${t}`);
    if (inp) inp.addEventListener('input', e => { S.search[t] = e.target.value; renderContent(); });
  });

  // Kind filter buttons (Abilities tab)
  content.querySelectorAll('.kind-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => { S.search.abilityKind = btn.dataset.kind; renderContent(); })
  );

  if (S.tab === 'monsters' && S.monster !== null) bindMonsterFormEvents();
  if (S.tab === 'abilities' && S.ability) bindAbilityFormEvents();
  if (S.tab === 'passives' && S.passive) bindPassiveFormEvents();
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
      if (f === 'hpCost' || f === 'healPercent' || f === 'healOnSwap') {
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
    S.dirty.templates  && { file: 'templates.json',  data: S.templates },
    S.dirty.abilities  && { file: 'abilities.json',   data: S.abilities },
    S.dirty.passives   && { file: 'passives.json',    data: S.passives },
  ].filter(Boolean);

  try {
    for (const { file, data } of toCommit) {
      const sha = await getFileSha(file);
      await putFile(file, data, sha, message);
    }
    S.dirty = { abilities: false, passives: false, templates: false };
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
