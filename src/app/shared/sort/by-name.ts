/** Alphabetisch nach Name (deutsche Sortierung, z. B. fuer Vorschlagslisten). */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'de');
}
