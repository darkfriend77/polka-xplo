import { describe, it, expect } from "vitest";
import { LRUCache } from "../lru-cache.js";

describe("LRUCache", () => {
  it("should store and retrieve values", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBeUndefined();
  });

  it("should evict the least recently used entry when over capacity", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("should refresh position on get()", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access "a" to refresh it
    cache.get("a");

    // Now "b" is the oldest
    cache.set("d", 4); // should evict "b"

    expect(cache.get("a")).toBe(1); // still present
    expect(cache.get("b")).toBeUndefined(); // evicted
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("should refresh position on set() update", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Update "a" to refresh it
    cache.set("a", 10);
    cache.set("d", 4); // should evict "b"

    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(3);
  });

  it("should support has() and delete()", () => {
    const cache = new LRUCache<string, number>(5);
    cache.set("x", 42);

    expect(cache.has("x")).toBe(true);
    expect(cache.has("y")).toBe(false);

    cache.delete("x");
    expect(cache.has("x")).toBe(false);
    expect(cache.get("x")).toBeUndefined();
  });

  it("should support clear()", () => {
    const cache = new LRUCache<number, string>(5);
    cache.set(1, "a");
    cache.set(2, "b");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(1)).toBeUndefined();
  });

  it("should throw on invalid maxSize", () => {
    expect(() => new LRUCache(0)).toThrow("LRU maxSize must be >= 1");
    expect(() => new LRUCache(-1)).toThrow("LRU maxSize must be >= 1");
  });

  it("should work with maxSize of 1", () => {
    const cache = new LRUCache<string, number>(1);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.size).toBe(1);
  });
});
