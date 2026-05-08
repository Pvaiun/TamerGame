# Bloodlines — Codebase Map

A creature-breeding roguelite. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Architecture in one paragraph
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()` from `src/ui/render.js`. `render()` clears `#app` and dispatches on `state.screen` to a screen renderer in `src/ui/screens.js` (or `src/ui/battle.js` for the battle screen). There is no virtual DOM, no framework, no router. UI builds DOM via the `el(tag, props, children)` helper in `src/ui/dom.js`.

## File map

### Data (JSON, drives behavior — prefer adding params here over hardcoding in JS)
- `data/types.json` — element list, type chart, palettes
- `data/templates.json` — species (baseStats, growth, abilityPool, primary/secondaryPassive, optional `starter: true`)
- `data/abilities.json` — ability dict keyed by ability id; see "Ability schema" below
- `data/passives.json` — passive dict keyed by passive id; each entry has params + a `codeRef` string naming the function in `passives.js` that consumes them
- `data/statuseffects.json` — burn/bloom/soaking/cursed/dazed canonical defaults
- `data/additionaleffects.json` — schema for entries that go in an ability's `additionalEffects[]`. Each type has `label`, `desc`, and a `params` map where each param has `type` (`percent`/`multiplier`/`bool`/`status`/`targets`/`swapTargets`), `default`, and `label`. Engine reads defaults from here when an instance omits a param; the editor uses it to render add/remove rows with editable inputs per type.

### Core (`src/`)
- `state.js` — `state` singleton, `pushLog`, `resetGame`, `nextCreatureId`, constants (`TOTAL_WAVES=10`, `BREED_WAVES={3,6,9}`, `MAX_LEVEL=50`)
- `data.js` — `loadData()` + named exports (`TYPES`, `TYPE_CHART`, `TYPE_PALETTE`, `PASSIVES`, `ABILITIES`, `STATUSES`, `ADDITIONAL_EFFECTS`, `TEMPLATES`, `ALL_ENCOUNTER_SPECIES`)
- `creature.js` — `makeCreature`, `gainXp`, `xpToNext`, `growthRank`, `rankColor`, `displayName`, `freshFighter` (the in-battle wrapper)
- `breeding.js` — `makeChild`, `finalizeBreed` (called on breed waves)
- `encounter.js` — `generateEnemy(Party)`, `generateBoss(Party)`, `partyAvgLevel`
- `rng.js` — `rand`, `randi`, `pick`, `pickN`, `sleep`
- `audio.js` — `sfx(type)` WebAudio bleeps; types: `hit, crit, heal, select, faint, victory, capture, levelup`
- `art.js` — procedural creature art / palette blending
- `version.js` — single-line version string

### Combat (`src/combat/`)
- `battle.js` — orchestrator. `beginBattle`, `playerAct(abilityKey)`, `playerSwap`, `resolveAction` (the big switch on `ability.kind`), `releaseCharge`, `handleFaintsIfAny`, `finishBattleIfDone`
- `damage.js` — `effectiveStat`, `calculateDamage`, `estimateDamage` (UI preview, deterministic)
- `status.js` — `applyStatus`, `cleanseStatuses`, `applyHeal`, `tickStartOfTurn`, `tickFighterStatuses`
- `abilities.js` — post-hit effect resolver. `processPostHit` → passives, `resolveAbilityEffect` → walks `ability.statusEffects[]` and `ability.additionalEffects[]`, `applyCursedOnSwap`, `handleAdditionalEffect` (per-effect switch)
- `passives.js` — every passive consumer. Functions match `codeRef` in `passives.json`: `applyStatMult`, `applyPowerMult`, `checkEvasion`, `getCritMult`, `applyFlatDmgReduction`, `blocksStatus`, `modifyHeal`, `applyBattleStartPassive`, `applySwapInPassives`, `applyPostHitPassives`, `applyTurnStartPassives`, `applyBenchPassives`. Helper `hasPassive(f, key)` and local `p(key)` reads `PASSIVES[key]`.
- `ai.js` — `aiChoose(ef, pf)` returns ability key or `'_swap'`

### UI (`src/ui/`)
- `render.js` — `render()` dispatcher; `advanceWave()`
- `screens.js` — every non-battle screen (`renderStart, renderStarterPick, renderBloodlineReady, renderHeader, renderPreBattle, renderAftermath, renderBreed, renderVictory, renderGameover`)
- `battle.js` — battle screen layout
- `cards.js` — creature card rendering
- `animations.js` — `spawnFloat`, `spawnCallout`, `shakeStage`, `playLunge`, `playRecoil` (DOM/CSS only, no canvas)
- `dom.js` — `el(tag, props, children)`, `attachLongPress`, `app()`, tooltip helpers

### Assets / tooling
- `index.html` — single page, `<div id="app">` + `<div id="modal-root">`, loads `src/main.js` as module
- `styles.css` — all styles (~24 KB, single file)
- `tools/editor/` — separate standalone data editor; not loaded by the game

## Key data schemas

### Ability (`data/abilities.json`)
Keyed by ability id. Fields:
- `name`, `desc` — display
- `kind` — one of: `attack`, `charge_attack`, `defend`, `apply_heal`, `buff`, `debuff`, `bench_support`, `swap_self`. Drives the branch in `resolveAction`.
- `power` — base power for damage formula (attack/charge_attack)
- `element` — `fire|water|grass|light|dark` or absent (neutral)
- `priority` — turn-order tiebreaker (default 0)
- `hits` — multi-hit count (default 1)
- `statMult` — `{atk?, def?, spd?}` battle-long mods (buff kind)
- `statusEffects` — `[{ status, targets: ["enemy"|"self"|"bench"|"enemy_bench"] }, ...]`
- `additionalEffects` — `[{ type, ...overrides }, ...]`. Each entry's `type` keys into `data/additionaleffects.json`, which defines the available params + their defaults; values on the instance override the defaults. Built-in types include `hp_cost`, `swap`, `lifesteal`, `cleanse`, `execute_scale`, `pierce`, `status_synergy`. Consumed in `abilities.js` / `damage.js` / `passives.js` / `battle.js`.
- `effect` + `effectParams` — bench_support variants
- `buffOnSwap`, `healOnSwap` — swap_self helpers (applied to the incoming bench fighter)
- `healPercent`, `healTurns` — apply_heal variants

### Passive (`data/passives.json`)
Each entry has params + a `codeRef` string that names the function in `passives.js` reading them. Add a passive: add JSON entry, then either extend the named function or wire up a new one. `codeRef: "TODO"` means params exist but no implementation yet.

### Status (`data/statuseffects.json`)
Canonical defaults (`turns`, `percentPerTurn`, etc.) read by `applyStatus` when call sites omit overrides.

### Fighter (in-battle, built by `freshFighter` in `creature.js`)
`{ creature, hp, statMods:{atk,def,spd}, bracingThisTurn, healing, statuses:{burn,bloom,soaking,cursed,dazed}, pendingSwapBuff, pendingSwapHeal, ... }`. The underlying `creature` object is never mutated during a fight.

## Conventions
- **Data over code.** New numbers belong in JSON. The pattern across the codebase: JSON entry → named function in `passives.js`/`abilities.js` reads `eff.type` or `passive.codeRef` and applies params. Avoid hardcoding magic numbers in JS — prefer adding a field to the JSON.
- **`state` is global and mutated directly.** Don't pass it as a parameter; import it.
- **Re-render after mutation.** Any user-visible change ends with `render()`. Async flows in `battle.js` interleave `render()` and `await sleep(ms)` for animation pacing.
- **No build step.** ES modules, browser-native. Don't introduce npm/bundlers without asking.
- **No comments unless non-obvious.** Existing code follows this; match it. Identifiers carry intent.
- **Two-creature party + two-creature bench.** `state.pf` (player active fighter), `state.bf` (player bench), `state.ef`, `state.ebf`. Swaps mutate these references in pairs; many bugs come from forgetting to update `state.activeIdx` / `state.enemyActiveIdx` / `state.enemy` alongside.
- **Side string `'player'|'enemy'`** is threaded through combat for log/animation routing.

## Adding things — checklists

**New ability:** add entry in `abilities.json` (set `kind`); if it needs new behavior beyond existing kinds/effects, extend `resolveAbilityEffect` / `handleAdditionalEffect` in `combat/abilities.js`, or the relevant branch in `resolveAction` (`combat/battle.js`). Then add it to one or more `abilityPool`s in `templates.json`.

**New passive:** add entry with params in `passives.json` (include `codeRef`); implement the consumer in `combat/passives.js` (use `hasPassive(f, key)` + `p(key)`); reference in a species' `primaryPassive` / `secondaryPassive`.

**New status effect:** add to `statuseffects.json`; extend the `applyStatus` switch in `combat/status.js`; add a tick branch in `tickFighterStatuses` if it ticks; add a slot in the `statuses` object of `freshFighter` (`creature.js`); decide whether `cleanseStatuses` should clear it.

**New screen:** add a renderer to `src/ui/screens.js`, register in the `switch` in `render.js`, set `state.screen = 'name'` somewhere to enter it.

**New species:** add entry in `templates.json` (set `starter: true` if it should appear in starter selection).

## Test / verify
No automated tests. Manual: open `index.html` in a browser, play through the relevant flow. For combat changes, the in-battle log (`state.log`, rendered on the battle screen) is the primary signal.
