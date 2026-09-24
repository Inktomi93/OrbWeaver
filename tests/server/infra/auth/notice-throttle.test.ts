// infra/auth/notice-throttle — one security line per key per hour, with a bounded key map. The relayed-fallback
// and public-http notices both ride it; their suites pin what each one logs.

import { createKeyedNoticeThrottle } from "../../../../packages/server/src/infra/auth/notice-throttle.ts";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
// The module's window and key cap, mirrored so the tests can step past them.
const HOUR_MS = 3_600_000;
const MAX_KEYS = 1024;

function harness(): { notify: (key: string) => void; advance: (ms: number) => void; emitted: string[] } {
  let at = T0;
  const emitted: string[] = [];
  const throttle = createKeyedNoticeThrottle(() => at);
  return {
    notify: (key): void => {
      throttle(key, () => {
        emitted.push(key);
      });
    },
    advance: (ms): void => {
      at += ms;
    },
    emitted,
  };
}

test("a key emits once per hour, and again once the hour has passed", () => {
  const h = harness();
  h.notify("203.0.113.9");
  h.notify("203.0.113.9");
  h.advance(HOUR_MS - 1);
  h.notify("203.0.113.9");
  expect(h.emitted).toEqual(["203.0.113.9"]);
  h.advance(1);
  h.notify("203.0.113.9");
  expect(h.emitted).toEqual(["203.0.113.9", "203.0.113.9"]);
});

test("keys are independent", () => {
  const h = harness();
  h.notify("a");
  h.notify("b");
  h.notify("a");
  expect(h.emitted).toEqual(["a", "b"]);
});

test("a full map of live keys drops new keys until their entries expire", () => {
  const h = harness();
  for (let i = 0; i < MAX_KEYS; i += 1) {
    h.notify(`2001:db8::${i.toString(16)}`);
  }
  expect(h.emitted).toHaveLength(MAX_KEYS);
  h.notify("198.51.100.7");
  expect(h.emitted).toHaveLength(MAX_KEYS);
  h.advance(HOUR_MS);
  h.notify("198.51.100.7");
  expect(h.emitted.at(-1)).toBe("198.51.100.7");
});
