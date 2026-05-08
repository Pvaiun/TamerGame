import { el } from './dom.js';
import { withBattleScene } from '../stage/game.js';

export function spawnFloat(side, text, kind = 'dmg') {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const f = el('div', { class: 'floating ' + (kind === 'crit' ? 'crit' : kind === 'heal' ? 'heal' : '') }, text);
  if (side === 'player') { f.style.left = '60px'; f.style.bottom = '160px'; }
  else { f.style.right = '60px'; f.style.bottom = '160px'; }
  stage.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

export function spawnCallout(text) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const c = el('div', { class: 'callout' }, text);
  stage.appendChild(c);
  setTimeout(() => c.remove(), 950);
}

export function shakeStage() {
  withBattleScene(s => s.shake());
}

export function playLunge(side) {
  withBattleScene(s => s.lunge(side));
}

export function playRecoil(side) {
  withBattleScene(s => s.recoil(side));
}
