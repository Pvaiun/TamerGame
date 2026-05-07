import { el } from './dom.js';

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
  const stage = document.getElementById('stage');
  if (!stage) return;
  stage.classList.add('shake');
  setTimeout(() => stage.classList.remove('shake'), 360);
}

export function playLunge(side) {
  const a = document.getElementById(side === 'player' ? 'p-actor' : 'e-actor');
  if (!a) return;
  a.classList.remove('idle'); a.classList.add('lunge');
  setTimeout(() => { a.classList.remove('lunge'); a.classList.add('idle'); }, 360);
}

export function playRecoil(side) {
  const a = document.getElementById(side === 'player' ? 'p-actor' : 'e-actor');
  if (!a) return;
  a.style.setProperty('--rx', side === 'player' ? '-12px' : '12px');
  a.classList.remove('idle'); a.classList.add('recoil');
  setTimeout(() => { a.classList.remove('recoil'); a.classList.add('idle'); }, 320);
}
