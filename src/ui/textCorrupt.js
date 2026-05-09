// Document-horror text utilities. The aesthetic uses two corruption techniques:
//   - strikethrough/overwrite: a word is written, struck through, replaced
//   - redaction: a word is covered with a red bar (used sparingly, on the most
//     charged words; imagination fills in worse than any specific word would)
// Both render as DOM strings via the el helper or as raw HTML.

import { el } from './dom.js';

// strike(badWord, goodWord) → "<s>badWord</s> goodWord" inline element.
// Use for emotionally specific corrections — the document editing itself.
export function strike(badWord, goodWord) {
  return el('span', { class: 'strike-pair' }, [
    el('s', {}, badWord),
    ' ',
    el('span', {}, goodWord),
  ]);
}

// redact(width) → opaque red bar. Width is char count; bar matches that width
// in monospace ems so it sits inline with surrounding text. Used on the most
// charged words.
export function redact(width = 6) {
  const w = Math.max(1, Math.round(width));
  return el('span', { class: 'redact', style: `width:${w}ch;` }, ' ');
}

// gold(word) → tonal-wrongness accent. Reserved for small charged words inside
// body text — never headlines, never the largest font on screen. The point is
// that the player notices it and wonders why.
export function gold(word) {
  return el('span', { class: 'doc-gold' }, word);
}

// HTML-string variants for places where DOM construction goes through
// innerHTML or template strings rather than the el helper.
export function strikeHTML(badWord, goodWord) {
  return `<s>${escapeHtml(badWord)}</s> ${escapeHtml(goodWord)}`;
}
export function redactHTML(width = 6) {
  const w = Math.max(1, Math.round(width));
  return `<span class="redact" style="width:${w}ch;"> </span>`;
}
export function goldHTML(word) {
  return `<span class="doc-gold">${escapeHtml(word)}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
