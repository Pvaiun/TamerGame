// Tiny module: just the predicate. Most other modules import this. Centralized
// here so the future passive editor can introspect / patch passive checks easily.
export function hasPassive(f, key) {
  return f.creature.passives && f.creature.passives.includes(key);
}
