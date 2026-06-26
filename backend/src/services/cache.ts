interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** Minimal TTL + size-bounded LRU cache (no external dep). */
export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  constructor(
    private maxSize = 500,
    private ttlMs = 24 * 60 * 60 * 1000,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // bump recency
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
