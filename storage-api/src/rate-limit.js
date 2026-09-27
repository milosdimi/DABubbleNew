const HOUR_MS = 60 * 60 * 1000;

/**
 * Gleitendes Fenster pro Schluessel (hier: uid), nur im Speicher.
 * Nach einem Neustart beginnt die Zaehlung von vorn - fuer dieses Projekt ausreichend.
 */
export function createRateLimiter(limit, windowMs = HOUR_MS, now = () => Date.now()) {
  const hits = new Map();

  /** Zaehlt einen Versuch; `false`, wenn das Limit schon erreicht ist. */
  return function allow(key) {
    const cutoff = now() - windowMs;
    const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now());
    hits.set(key, recent);
    return true;
  };
}
