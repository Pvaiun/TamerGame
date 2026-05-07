import { el, app } from './dom.js';
import { VERSION } from '../version.js';
import { TEMPLATES, ABILITIES, PASSIVES } from '../data.js';
import { state, BREED_WAVES, TOTAL_WAVES, resetGame } from '../state.js';
import { sfx } from '../audio.js';
import { makeCreature, displayName } from '../creature.js';
import { generateEnemyParty, generateBossParty, partyAvgLevel } from '../encounter.js';
import { creatureCardEl } from './cards.js';
import { beginBattle } from '../combat/battle.js';
import { makeChild, finalizeBreed } from '../breeding.js';
import { render, advanceWave } from './render.js';

export function renderHeader() {
  return el('div', { class: 'header-stats' }, [
    el('div', { class: 'header-stat' }, [
      el('div', { class: 'header-stat-label' }, 'WAVE'),
      el('div', { class: 'header-stat-value' }, `${state.wave} / ${TOTAL_WAVES}`),
    ]),
    el('div', { class: 'header-stat' }, [
      el('div', { class: 'header-stat-label' }, 'PARTY'),
      el('div', { class: 'header-stat-value' }, String(state.party.length)),
    ]),
    el('div', { class: 'header-stat' }, [
      el('div', { class: 'header-stat-label' }, 'RESERVE'),
      el('div', { class: 'header-stat-value' }, String(state.reserve.length)),
    ]),
    el('div', { class: 'header-stat' }, [
      el('div', { class: 'header-stat-label' }, 'NEXT BREED'),
      el('div', { class: 'header-stat-value' }, (() => {
        const ws = [3, 6, 9].filter(x => x >= state.wave);
        if (!ws.length) return '—';
        return `W${ws[0]}`;
      })()),
    ]),
  ]);
}

export function renderStart() {
  app().appendChild(el('div', { style: 'position: fixed; top: 8px; right: 10px; font-size: 10px; color: var(--text-dim); opacity: 0.5;' }, `v${VERSION}`));
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, 'The Bloodline Awaits'));
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 13px; line-height: 1.6; margin-bottom: 12px;' },
    'Begin with two starters. After every battle you capture the defeated creature. Every three waves the bloodline ritual demands a sacrifice — pick two pairs from your five creatures, breed them into your new party of two, and release the rest. The deepest bloodlines triumph at wave ten.'
  ));
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 12px; line-height: 1.5; margin-bottom: 16px;' },
    'Each creature has a passive ability that defines its identity. Breeding inherits one passive from each parent.'
  ));
  panel.appendChild(el('button', { class: 'primary', style: 'display: block; margin: 0 auto;', onclick: () => {
    state.starterPool = TEMPLATES.filter(t => t.starter).map(t => makeCreature(t, 1));
    state.screen = 'starter_pick';
    render();
  } }, 'Begin'));
  app().appendChild(panel);
}

export function renderStarterPick() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, `Choose your first starter (1/2)`));
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 12px; margin-bottom: 12px;' },
    state.party.length === 0 ? 'Pick your first companion.' : 'Pick your second companion.'
  ));

  const grid = el('div', { class: 'roster-grid' });
  for (const preview of state.starterPool) {
    if (state.party.find(c => c.species === preview.species)) continue;
    grid.appendChild(creatureCardEl(preview, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.party.push(preview);
        if (state.party.length < 2) {
          render();
        } else {
          state.screen = 'bloodline_ready';
          render();
        }
      },
    }));
  }
  panel.appendChild(grid);
  app().appendChild(panel);
}

export function renderBloodlineReady() {
  const panel = el('div', { class: 'panel ready-panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, 'Your bloodline begins'));
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 12px; margin-bottom: 14px;' },
    'Two creatures stand at the start of your line. Long-press a card to inspect their abilities and passives.'
  ));
  for (const c of state.party) {
    panel.appendChild(creatureCardEl(c));
  }
  panel.appendChild(el('button', { class: 'primary', style: 'margin-top: 14px; display: block; width: 100%;', onclick: () => {
    state.wave = 1;
    state.enemyParty = generateEnemyParty(state.wave, partyAvgLevel(state.party));
    state.enemyActiveIdx = 0;
    state.enemy = state.enemyParty[0];
    state.screen = 'prebattle';
    render();
  } }, 'Enter the gauntlet'));
  app().appendChild(panel);
}

export function renderPreBattle() {
  const panel = el('div', { class: 'panel' });
  const isBoss = state.wave === TOTAL_WAVES;
  panel.appendChild(el('div', { class: 'panel-title' }, isBoss ? `Final wave — Apex enemies appear` : `Wave ${state.wave} approaches`));

  panel.appendChild(el('div', { style: 'color: var(--text-dim); font-size: 12px; margin-bottom: 6px;' }, `Enemies (${state.enemyParty.length}):`));
  for (const e of state.enemyParty) {
    panel.appendChild(creatureCardEl(e));
  }

  panel.appendChild(el('div', { style: 'color: var(--text-dim); font-size: 12px; margin: 14px 0 6px;' }, 'Lead with:'));
  for (let i = 0; i < state.party.length; i++) {
    const c = state.party[i];
    panel.appendChild(creatureCardEl(c, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.activeIdx = i;
        beginBattle();
      },
    }));
  }
  app().appendChild(panel);
}

export function renderAftermath() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, `Wave ${state.wave} cleared`));
  const ev = state.postBattleEvents;
  panel.appendChild(el('div', { style: 'color: var(--text-dim); font-size: 12px; margin-bottom: 8px;' },
    `Each member of your bloodline gained ${ev.xpGained} XP.`));
  for (const rep of ev.xpReports) {
    const c = rep.creature;
    const wrapper = el('div', { style: 'margin-bottom: 8px;' });
    if (rep.levelEvents.length) {
      for (const lev of rep.levelEvents) {
        const lc = el('div', { class: 'levelup-card' });
        lc.appendChild(el('div', { class: 'levelup-line' }, `${displayName(c)} — LEVEL UP! → L${lev.level}`));
        const dl = el('div', { class: 'levelup-deltas' });
        for (const [k, v] of Object.entries(lev.deltas)) {
          dl.appendChild(el('span', { class: 'delta' }, `+${v} ${k.toUpperCase()}`));
        }
        lc.appendChild(dl);
        wrapper.appendChild(lc);
      }
    }
    wrapper.appendChild(creatureCardEl(c));
    panel.appendChild(wrapper);
  }

  panel.appendChild(el('div', { style: 'margin-top: 14px; color: var(--text-dim); font-size: 12px;' },
    'Capture one of the defeated. Long-press a card for full details.'));
  for (const candidate of ev.capturedChoices) {
    panel.appendChild(creatureCardEl(candidate, {
      selectable: true,
      selected: ev.capturedSelected && ev.capturedSelected.id === candidate.id,
      onclick: () => {
        ev.capturedSelected = candidate;
        render();
      },
    }));
  }

  const continueBtn = el('button', { class: 'primary', style: 'margin-top: 12px;' },
    ev.capturedSelected ? 'Continue' : 'Pick a creature to capture');
  if (!ev.capturedSelected) continueBtn.disabled = true;
  if (ev.capturedSelected) {
    continueBtn.addEventListener('click', () => {
      sfx('capture');
      state.reserve.push(ev.capturedSelected);
      if (BREED_WAVES.has(state.wave)) {
        state.breedState = {
          stage: 'pick_pair_1',
          pool: [...state.party, ...state.reserve],
          picks: [],
          currentPair: [],
        };
        state.screen = 'breed';
        render();
      } else {
        advanceWave();
      }
    });
  }
  panel.appendChild(continueBtn);

  app().appendChild(panel);
}

export function renderBreed() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, 'The Bloodline Ritual'));
  const bs = state.breedState;

  if (bs.stage === 'pick_pair_1' || bs.stage === 'pick_pair_2') {
    const pairIdx = bs.stage === 'pick_pair_1' ? 0 : 1;
    const used = new Set();
    for (const pair of bs.picks) for (let i = 0; i < 2; i++) used.add(pair[i].id);
    const currentPair = bs.currentPair || [];
    panel.appendChild(el('p', { style: 'color: #8a8a98; font-size: 12px; margin-bottom: 8px;' },
      `Choose pair ${pairIdx + 1} of 2 — pick two parents (${currentPair.length}/2). They will produce one child. The unchosen creature will be released.`
    ));
    for (const c of bs.pool) {
      const pickedNow = currentPair.find(p => p.id === c.id);
      const pickedEarlier = used.has(c.id);
      panel.appendChild(creatureCardEl(c, {
        selectable: !pickedEarlier,
        selected: !!pickedNow,
        dimmed: pickedEarlier,
        onclick: pickedEarlier ? null : () => {
          if (pickedNow) bs.currentPair = currentPair.filter(p => p.id !== c.id);
          else if (currentPair.length < 2) bs.currentPair = [...currentPair, c];
          if ((bs.currentPair || []).length === 2) {
            bs.stage = pairIdx === 0 ? 'config_pair_1' : 'config_pair_2';
            const [pa, pb] = bs.currentPair;
            bs.abilityOptions = Array.from(new Set([...pa.abilities, ...pb.abilities]));
            const pmap = {};
            for (const k of pa.passives || []) {
              if (k) pmap[k] = pmap[k] === 'b' ? 'both' : 'a';
            }
            for (const k of pb.passives || []) {
              if (k) pmap[k] = pmap[k] === 'a' ? 'both' : (pmap[k] === 'both' ? 'both' : 'b');
            }
            bs.passiveOptions = Object.entries(pmap).map(([key, owner]) => ({ key, owner }));
            bs.chosenAbilities = [];
            bs.chosenPassives = [];
          }
          render();
        },
      }));
    }
    app().appendChild(panel);
    return;
  }

  if (bs.stage === 'config_pair_1' || bs.stage === 'config_pair_2') {
    const pairIdx = bs.stage === 'config_pair_1' ? 0 : 1;
    const [pa, pb] = bs.currentPair;
    panel.appendChild(el('p', { style: 'color: #8a8a98; font-size: 12px; margin-bottom: 8px;' },
      `Configure offspring for pair ${pairIdx + 1}. Pick 4 abilities and 2 passives. The first passive picked determines the offspring's shape.`
    ));
    panel.appendChild(el('button', {
      style: 'font-size: 11px; padding: 5px 10px; margin-bottom: 8px; background: transparent; color: var(--text-dim); border: 1px solid var(--border);',
      onclick: () => {
        bs.stage = pairIdx === 0 ? 'pick_pair_1' : 'pick_pair_2';
        bs.currentPair = [];
        bs.chosenAbilities = [];
        bs.chosenPassives = [];
        render();
      },
    }, '← Pick different parents'));
    const parents = el('div', { class: 'roster-grid' });
    parents.appendChild(creatureCardEl(pa, { showGrowths: true }));
    parents.appendChild(creatureCardEl(pb, { showGrowths: true }));
    panel.appendChild(parents);

    panel.appendChild(el('div', { style: 'margin-top: 14px; font-size: 11px; letter-spacing: 1px; color: var(--accent);' }, `ABILITIES (${bs.chosenAbilities.length}/4)`));
    const aRow = el('div', { style: 'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;' });
    for (const k of bs.abilityOptions) {
      const picked = bs.chosenAbilities.includes(k);
      aRow.appendChild(el('button', {
        class: 'ability-pick-btn' + (picked ? ' picked' : ''),
        style: picked ? 'background: linear-gradient(180deg, #5a4a2a, #4a3a1a); border-color: var(--accent); font-size: 11px; padding: 5px 9px;' : 'font-size: 11px; padding: 5px 9px;',
        onclick: () => {
          if (picked) bs.chosenAbilities = bs.chosenAbilities.filter(x => x !== k);
          else if (bs.chosenAbilities.length < 4) bs.chosenAbilities.push(k);
          render();
        },
      }, ABILITIES[k].name));
    }
    panel.appendChild(aRow);

    panel.appendChild(el('div', { style: 'margin-top: 14px; font-size: 11px; letter-spacing: 1px; color: var(--accent);' }, `PASSIVES (${bs.chosenPassives.length}/2)`));
    panel.appendChild(el('div', { style: 'color: var(--text-faint); font-size: 10px; margin-top: 2px; margin-bottom: 6px;' }, "Pick 2 — first pick determines the offspring's species (shape)."));
    const pRow = el('div', { style: 'display: flex; gap: 6px; flex-wrap: wrap;' });
    for (const opt of bs.passiveOptions) {
      const k = opt.key;
      const picked = bs.chosenPassives.includes(k);
      const idx = bs.chosenPassives.indexOf(k);
      const p = PASSIVES[k];
      const ownerLabel = opt.owner === 'a' ? pa.species
                       : opt.owner === 'b' ? pb.species
                       : `${pa.species}/${pb.species}`;
      pRow.appendChild(el('button', {
        class: picked ? 'picked' : '',
        style: picked ? 'background: linear-gradient(180deg, #5a4a2a, #4a3a1a); border-color: var(--accent); font-size: 11px; padding: 5px 9px;' : 'font-size: 11px; padding: 5px 9px;',
        title: (p ? p.desc : '') + ` (from ${ownerLabel})`,
        onclick: () => {
          if (picked) bs.chosenPassives = bs.chosenPassives.filter(x => x !== k);
          else if (bs.chosenPassives.length < 2) bs.chosenPassives.push(k);
          render();
        },
      }, [
        p ? '◆ ' + p.name : k,
        idx === 0 ? el('span', { style: 'color: var(--accent); font-size: 9px; margin-left: 6px; letter-spacing: 1px;' }, '· SHAPE') : null,
      ].filter(Boolean)));
    }
    panel.appendChild(pRow);

    if (bs.chosenAbilities.length === 4 && bs.chosenPassives.length === 2) {
      const firstPick = bs.chosenPassives[0];
      const firstOpt = bs.passiveOptions.find(o => o.key === firstPick);
      const speciesFromB = firstOpt && firstOpt.owner === 'b';
      const child = makeChild(pa, pb, bs.chosenAbilities, bs.chosenPassives, speciesFromB);
      const preview = el('div', { class: 'breed-preview' });
      preview.appendChild(el('div', { style: 'font-size: 11px; color: var(--accent); letter-spacing: 2px; margin-bottom: 8px;' }, 'OFFSPRING PREVIEW'));
      preview.appendChild(creatureCardEl(child, { showGrowths: true }));
      panel.appendChild(preview);
      panel.appendChild(el('button', { class: 'primary', style: 'margin-top: 12px;', onclick: () => {
        sfx('victory');
        bs.picks.push([pa, pb, child]);
        bs.currentPair = [];
        if (pairIdx === 0) {
          bs.stage = 'pick_pair_2';
          render();
        } else {
          finalizeBreed();
        }
      } }, 'Confirm Birth'));
    }
    app().appendChild(panel);
    return;
  }

  app().appendChild(panel);
}

export function renderVictory() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, 'You triumphed.'));
  const all = [...state.party, ...state.reserve];
  const maxLvl = all.reduce((a, c) => Math.max(a, c.level), 0);
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 13px; line-height: 1.6; margin-bottom: 12px;' },
    `The bloodline endures. Reached wave ${state.wave} of ${TOTAL_WAVES}, with ${all.length} creature(s), top level L${maxLvl}.`));
  for (const c of state.party) panel.appendChild(creatureCardEl(c));
  panel.appendChild(el('button', { class: 'primary', style: 'margin-top: 16px;', onclick: () => { resetGame(); render(); } }, 'New Run'));
  app().appendChild(panel);
}

export function renderGameover() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-title' }, 'The bloodline withers.'));
  panel.appendChild(el('p', { style: 'color: var(--text-dim); font-size: 13px; line-height: 1.6;' },
    `Your fighter fell at wave ${state.wave}. The bloodline is broken.`));
  panel.appendChild(el('button', { class: 'primary', style: 'margin-top: 16px;', onclick: () => { resetGame(); render(); } }, 'New Run'));
  app().appendChild(panel);
}
