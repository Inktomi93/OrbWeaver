// A tab `sessionStorage` stand-in over a Map for node suites, which have no DOM storage. Returns the map so a
// test reads what landed without going through the door under test.

import { vi } from "vitest";

export function stubTabStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  });
  return map;
}
