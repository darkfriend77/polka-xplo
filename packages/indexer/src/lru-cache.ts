/**
 * Simple LRU (Least Recently Used) cache backed by a Map.
 *
 * Relies on Map's insertion-order iteration: when a key is accessed it is
 * deleted and re-inserted so it moves to the "most recently used" end.
 * When the cache exceeds `maxSize`, the oldest entry (first key) is evicted.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) throw new Error("LRU maxSize must be >= 1");
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Move to most-recently-used position
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // If key already exists, refresh its position
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    // Evict oldest if over capacity
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
