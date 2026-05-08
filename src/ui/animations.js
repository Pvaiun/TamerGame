import { el } from './dom.js';
import { withBattleScene } from '../stage/game.js';

export function spawnFloat(side, text, kind = 'dmg') {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const r = stage.getBoundingClientRect();
  const f = el('div', { class: 'floating ' + (kind === 'crit' ? 'crit' : kind === 'heal' ? 'heal' : '') }, text);
  f.style.position = 'fixed';
  if (side === 'player') f.style.left = `${r.left + 60}px`;
  else                   f.style.right = `${window.innerWidth - r.right + 60}px`;
  f.style.top = `${r.bottom - 160}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

export function spawnCallout(text) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const r = stage.getBoundingClientRect();
  const c = el('div', { class: 'callout' }, text);
  c.style.position = 'fixed';
  c.style.left = `${r.left + r.width / 2}px`;
  c.style.top  = `${r.top + r.height * 0.3}px`;
  document.body.appendChild(c);
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
