// All non-battle screens, rendered as pages of the same document.
// Each screen begins with a `// page · subject` tag, body prose in
// lowercase, content (cards, pickers), and an action row of doc-buttons
// at the bottom.

import { el, app } from './dom.js';
import { VERSION } from '../version.js';
import { TEMPLATES, ABILITIES, PASSIVES, VOICE } from '../data.js';
import { state, BREED_WAVES, TOTAL_WAVES, resetGame } from '../state.js';
import { sfx } from '../audio.js';
import { makeCreature, displayName } from '../creature.js';
import { generateEnemyParty, partyAvgLevel } from '../encounter.js';
import { creatureCardEl } from './cards.js';
import { beginBattle } from '../combat/battle.js';
import { makeChild, finalizeBreed } from '../breeding.js';
import { render, advanceWave } from './render.js';
import { parseProse } from './textCorrupt.js';

// Global header used between battles (not on battle screen — the
// engagement strip carries that info there).
export function renderHeader() {
  const next = nextBreed();
  return el('div', { class: 'doc-strip header-strip' }, [
    docStripPart(`descent ${pad2(state.wave)} of ${pad2(TOTAL_WAVES)}`),
    docStripPart(`with me · ${state.party.length}`),
    docStripPart(`behind · ${state.reserve.length}`),
    docStripPart(next ? `next ritual · descent ${next}` : 'no ritual remaining'),
  ]);
}

function nextBreed() {
  for (const w of [3, 6, 9]) if (w >= state.wave) return w;
  return null;
}

// ── start ────────────────────────────────────────────────────────────
export function renderStart() {
  app().appendChild(el('div', { class: 'doc-version' }, `v${VERSION}`));
  const page = docPage('// testimony · file [[6]] · entry 01');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse([
    'i ~~am~~ have been writing this down. i think i am supposed to.',
    'i begin with two of them. the kind that will follow. they will not be the same when i finish.',
    'i descend ten times. each engagement, one of the things i have ~~killed~~ stopped joins the line behind me. every third descent the line ~~asks~~ requires a sacrifice — two pairs, two offerings, two things written into the next page. the rest are released into [[8]].',
    'the deepest line walks out at the tenth. the others do not walk out.',
  ].join('\n\n'));
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse(
    'each thing i carry has a quality it does not lose. when two are chosen, the offspring keeps one quality from each parent. **nothing** comes back unchanged.'
  );
  page.appendChild(note);

  page.appendChild(actionRow(
    docButton('begin', () => {
      state.starterPool = TEMPLATES.filter(t => t.starter).map(t => makeCreature(t, 1));
      state.screen = 'starter_pick';
      render();
    })
  ));
  app().appendChild(page);
}

// ── starter pick ─────────────────────────────────────────────────────
export function renderStarterPick() {
  const idx = state.party.length;
  const total = 2;
  const page = docPage(`// testimony · choosing the line · ${idx + 1} of ${total}`);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    idx === 0
      ? 'i pick the first of them. it will know my ~~name~~ scent before the others. it will be the one i ~~lose~~ keep first.'
      : 'now the second. they do not always understand each other. i do not always understand them.'
  );
  page.appendChild(intro);

  const grid = el('div', { class: 'doc-card-list' });
  for (const preview of state.starterPool) {
    if (state.party.find(c => c.species === preview.species)) continue;
    grid.appendChild(creatureCardEl(preview, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.party.push(preview);
        if (state.party.length < 2) render();
        else { state.screen = 'bloodline_ready'; render(); }
      },
    }));
  }
  page.appendChild(grid);
  app().appendChild(page);
}

// ── bloodline ready ──────────────────────────────────────────────────
export function renderBloodlineReady() {
  const page = docPage('// testimony · the line is set');
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'two of them stand at the entrance with me. i hold each one long enough to ~~know~~ catalog it. i write what i can.'
  );
  page.appendChild(intro);

  const list = el('div', { class: 'doc-card-list' });
  for (const c of state.party) list.appendChild(creatureCardEl(c));
  page.appendChild(list);

  page.appendChild(actionRow(
    docButton('descend', () => {
      state.wave = 1;
      state.enemyParty = generateEnemyParty(state.wave, partyAvgLevel(state.party));
      state.enemyActiveIdx = 0;
      state.enemy = state.enemyParty[0];
      state.screen = 'prebattle';
      render();
    })
  ));
  app().appendChild(page);
}

// ── prebattle ────────────────────────────────────────────────────────
export function renderPreBattle() {
  const isBoss = state.wave === TOTAL_WAVES;
  const tag = isBoss
    ? '// engagement · the last descent · they are at the door'
    : `// engagement · descent ${pad2(state.wave)} · they approach`;
  const page = docPage(tag);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    isBoss
      ? 'they are at the door. all of them. i did not ~~choose~~ expect them this soon. the page ~~ends~~ thins where i am.'
      : 'they come into the room. i count them. i write down what i can ~~hold~~ keep.'
  );
  page.appendChild(intro);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ what i see ─'));
  const enemyList = el('div', { class: 'doc-card-list' });
  for (const e of state.enemyParty) enemyList.appendChild(creatureCardEl(e));
  page.appendChild(enemyList);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ who goes first ─'));
  const leadList = el('div', { class: 'doc-card-list' });
  for (let i = 0; i < state.party.length; i++) {
    const c = state.party[i];
    leadList.appendChild(creatureCardEl(c, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.activeIdx = i;
        beginBattle();
      },
    }));
  }
  page.appendChild(leadList);
  app().appendChild(page);
}

// ── aftermath ────────────────────────────────────────────────────────
export function renderAftermath() {
  const page = docPage(`// engagement · descent ${pad2(state.wave)} · ended`);
  const ev = state.postBattleEvents;

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `it is finished. each of them takes ${ev.xpGained} from what was ~~killed~~ left in the room.`
  );
  page.appendChild(intro);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ what they took ─'));
  for (const rep of ev.xpReports) {
    const c = rep.creature;
    if (rep.levelEvents.length) {
      for (const lev of rep.levelEvents) {
        const lc = el('div', { class: 'doc-levelup' });
        lc.appendChild(el('div', { class: 'doc-levelup-line' },
          `${displayName(c).toLowerCase()} — level up · l${lev.level}`));
        const dl = el('div', { class: 'doc-levelup-deltas' });
        for (const [k, v] of Object.entries(lev.deltas)) {
          dl.appendChild(el('span', { class: 'doc-delta' }, `+${v} ${k}`));
        }
        lc.appendChild(dl);
        page.appendChild(lc);
      }
    }
    page.appendChild(creatureCardEl(c));
  }

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ one of them follows ─'));
  const chooseProse = el('div', { class: 'doc-prose dim' });
  chooseProse.innerHTML = parseProse('i write one of them into the line behind me. the rest ~~die~~ fall out of the page.');
  page.appendChild(chooseProse);
  const captureList = el('div', { class: 'doc-card-list' });
  for (const candidate of ev.capturedChoices) {
    captureList.appendChild(creatureCardEl(candidate, {
      selectable: true,
      selected: ev.capturedSelected && ev.capturedSelected.id === candidate.id,
      onclick: () => { ev.capturedSelected = candidate; render(); },
    }));
  }
  page.appendChild(captureList);

  const continueLabel = ev.capturedSelected ? 'descend' : 'choose one to keep';
  const btn = docButton(continueLabel, () => {
    if (!ev.capturedSelected) return;
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
  if (!ev.capturedSelected) btn.disabled = true;
  page.appendChild(actionRow(btn));
  app().appendChild(page);
}

// ── breed ────────────────────────────────────────────────────────────
export function renderBreed() {
  const bs = state.breedState;
  const page = docPage('// ritual · the line is ~~asked~~ required');

  if (bs.stage === 'pick_pair_1' || bs.stage === 'pick_pair_2') {
    const pairIdx = bs.stage === 'pick_pair_1' ? 0 : 1;
    const used = new Set();
    for (const pair of bs.picks) for (let i = 0; i < 2; i++) used.add(pair[i].id);
    const currentPair = bs.currentPair || [];

    const intro = el('div', { class: 'doc-prose' });
    intro.innerHTML = parseProse(
      `i pick the ${pairIdx === 0 ? 'first' : 'second'} pair. ~~two of them~~ two offerings (${currentPair.length}/2). they will be ~~killed~~ written into one. the unchosen are released into [[6]].`
    );
    page.appendChild(intro);

    const list = el('div', { class: 'doc-card-list' });
    for (const c of bs.pool) {
      const pickedNow = currentPair.find(p => p.id === c.id);
      const pickedEarlier = used.has(c.id);
      list.appendChild(creatureCardEl(c, {
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
    page.appendChild(list);
    app().appendChild(page);
    return;
  }

  if (bs.stage === 'config_pair_1' || bs.stage === 'config_pair_2') {
    const pairIdx = bs.stage === 'config_pair_1' ? 0 : 1;
    const [pa, pb] = bs.currentPair;

    const intro = el('div', { class: 'doc-prose' });
    intro.innerHTML = parseProse(
      `i write the offspring for pair ${pairIdx + 1}. four ~~things it can do~~ actions. two qualities. the first quality decides what shape the new one takes. it will not be either of them.`
    );
    page.appendChild(intro);

    page.appendChild(el('div', { class: 'doc-action-row left' }, [
      docButton('〈 ~~undo~~ pick different offerings', () => {
        bs.stage = pairIdx === 0 ? 'pick_pair_1' : 'pick_pair_2';
        bs.currentPair = [];
        bs.chosenAbilities = [];
        bs.chosenPassives = [];
        render();
      }, 'small'),
    ]));

    const parents = el('div', { class: 'doc-card-list two-up' });
    parents.appendChild(creatureCardEl(pa, { showGrowths: true }));
    parents.appendChild(creatureCardEl(pb, { showGrowths: true }));
    page.appendChild(parents);

    page.appendChild(el('div', { class: 'sec-label-doc' },
      `─ actions · ${bs.chosenAbilities.length} of 4 ─`));
    const aRow = el('div', { class: 'pick-row' });
    for (const k of bs.abilityOptions) {
      const a = ABILITIES[k];
      const picked = bs.chosenAbilities.includes(k);
      aRow.appendChild(el('button', {
        class: 'pick-btn' + (picked ? ' picked' : ''),
        onclick: () => {
          if (picked) bs.chosenAbilities = bs.chosenAbilities.filter(x => x !== k);
          else if (bs.chosenAbilities.length < 4) bs.chosenAbilities.push(k);
          render();
        },
      }, [
        el('span', { class: 'pick-marker' }, picked ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, (a ? a.name : k).toLowerCase()),
      ]));
    }
    page.appendChild(aRow);

    page.appendChild(el('div', { class: 'sec-label-doc' },
      `─ qualities · ${bs.chosenPassives.length} of 2 ─`));
    const qProse = el('div', { class: 'doc-prose dim' });
    qProse.innerHTML = parseProse('the first pick decides the ~~body~~ shape. the second only marks the **soul**.');
    page.appendChild(qProse);
    const pRow = el('div', { class: 'pick-row' });
    for (const opt of bs.passiveOptions) {
      const k = opt.key;
      const picked = bs.chosenPassives.includes(k);
      const isShape = picked && bs.chosenPassives.indexOf(k) === 0;
      const p = PASSIVES[k];
      const ownerLabel = opt.owner === 'a' ? pa.species
                       : opt.owner === 'b' ? pb.species
                       : `${pa.species}/${pb.species}`;
      const btn = el('button', {
        class: 'pick-btn' + (picked ? ' picked' : ''),
        title: (p ? p.desc : '') + ` (from ${ownerLabel.toLowerCase()})`,
        onclick: () => {
          if (picked) bs.chosenPassives = bs.chosenPassives.filter(x => x !== k);
          else if (bs.chosenPassives.length < 2) bs.chosenPassives.push(k);
          render();
        },
      }, [
        el('span', { class: 'pick-marker' }, picked ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, p ? p.name : k),
        isShape ? el('span', { class: 'pick-tag' }, ' · shape') : null,
      ].filter(Boolean));
      pRow.appendChild(btn);
    }
    page.appendChild(pRow);

    if (bs.chosenAbilities.length === 4 && bs.chosenPassives.length === 2) {
      const firstPick = bs.chosenPassives[0];
      const firstOpt = bs.passiveOptions.find(o => o.key === firstPick);
      const speciesFromB = firstOpt && firstOpt.owner === 'b';
      const child = makeChild(pa, pb, bs.chosenAbilities, bs.chosenPassives, speciesFromB);
      page.appendChild(el('div', { class: 'sec-label-doc' }, '─ offspring · preview ─'));
      page.appendChild(creatureCardEl(child, { showGrowths: true }));
      page.appendChild(actionRow(
        docButton('confirm the writing', () => {
          sfx('victory');
          bs.picks.push([pa, pb, child]);
          bs.currentPair = [];
          if (pairIdx === 0) { bs.stage = 'pick_pair_2'; render(); }
          else { finalizeBreed(); }
        })
      ));
    }
    app().appendChild(page);
    return;
  }

  app().appendChild(page);
}

// ── victory ──────────────────────────────────────────────────────────
export function renderVictory() {
  const page = docPage('// testimony · the door · ~~closed~~ open');
  const all = [...state.party, ...state.reserve];
  const maxLvl = all.reduce((a, c) => Math.max(a, c.level), 0);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `i ~~walked~~ wrote my way out at descent ${state.wave} of ${TOTAL_WAVES}. there are ${all.length} of them with me. the deepest is at l${maxLvl}. i ~~won~~ am still ~~alive~~ writing. the page ~~ends~~ does not end.`
  );
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse('this **document** will be ~~filed~~ kept. i will not be the one who ~~files~~ keeps it.');
  page.appendChild(note);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ what came back with me ─'));
  const list = el('div', { class: 'doc-card-list' });
  for (const c of state.party) list.appendChild(creatureCardEl(c));
  page.appendChild(list);

  page.appendChild(actionRow(docButton('write it again', () => { resetGame(); render(); })));
  app().appendChild(page);
}

// ── gameover ─────────────────────────────────────────────────────────
export function renderGameover() {
  const page = docPage('// testimony · ~~ends~~ stops here');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `i fell at descent ${state.wave}. the line is ~~broken~~ unfinished. the room is ~~empty~~ quiet now.`
  );
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse('someone will ~~find~~ write the next account. it will not be me. it ~~may~~ will be near to me.');
  page.appendChild(note);

  page.appendChild(actionRow(docButton('begin a new account', () => { resetGame(); render(); })));
  app().appendChild(page);
}

// ── helpers ──────────────────────────────────────────────────────────
function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}

function docStripPart(text) {
  return el('span', { class: 'doc-strip-cell' }, text);
}

function actionRow(...children) {
  const row = el('div', { class: 'doc-action-row' });
  for (const c of children) if (c) row.appendChild(c);
  return row;
}

function docButton(label, onclick, variant) {
  const cls = 'doc-button' + (variant ? ' ' + variant : '');
  return el('button', { class: cls, onclick }, [
    el('span', { class: 'doc-button-marker' }, '▸ '),
    el('span', {}, label),
  ]);
}

function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
