// @subject packages/server/src/foundation/env/index.ts
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { personaAutoSeedAdmits } from "@orb/server/foundation/env";
import { describe, expect, test } from "vitest";

type Stamp = "on" | "off";
const HARNESS = "E2E_HARNESS";
const DEV_SEED = "DEV_SEED";
const ASK_LIST = "E2E_FIRST_RUN_ASK_HANDLES";

const stamps = (harness: Stamp, devSeed: Stamp, list?: string): Parameters<typeof personaAutoSeedAdmits>[0] => ({
  [HARNESS]: harness,
  [DEV_SEED]: devSeed,
  [ASK_LIST]: list,
});
const handle = (text: string): Handle => castId<Handle>(text);

describe("the persona auto-create policy", () => {
  test("an automation stack auto-seeds an account its opt-out list does not name", () => {
    expect(personaAutoSeedAdmits(stamps("on", "off", "ask-a,ask-b"), handle("owner"))).toBe(true);
    expect(personaAutoSeedAdmits(stamps("off", "on"), handle("owner"))).toBe(true);
  });

  test("the list subtracts from either automation stamp, entry by entry, around its whitespace", () => {
    for (const listed of [
      stamps("on", "off", "ask-a, ask-b ,,ask-c"),
      stamps("off", "on", "ask-a, ask-b ,,ask-c"),
      stamps("on", "on", "ask-a, ask-b ,,ask-c"),
    ]) {
      expect(personaAutoSeedAdmits(listed, handle("ask-a"))).toBe(false);
      expect(personaAutoSeedAdmits(listed, handle("ask-b"))).toBe(false);
      expect(personaAutoSeedAdmits(listed, handle("ask-c"))).toBe(false);
      expect(personaAutoSeedAdmits(listed, handle("ask-d"))).toBe(true);
    }
  });

  test("with neither stamp on the list changes nothing: no value turns the auto-seed on", () => {
    for (const list of [undefined, "", "owner", "ask-a,owner"]) {
      expect(personaAutoSeedAdmits(stamps("off", "off", list), handle("owner"))).toBe(false);
      expect(personaAutoSeedAdmits(stamps("off", "off", list), handle("ask-a"))).toBe(false);
    }
  });

  test("handles compare on the D257 key, so a case or lookalike spelling of a listed handle is the same account", () => {
    expect(personaAutoSeedAdmits(stamps("on", "off", "ask-desktop-bubble"), handle("Ask-Desktop-Bubble"))).toBe(false);
    expect(personaAutoSeedAdmits(stamps("on", "off", "Ask-Desktop-Bubble"), handle("ask-desktop-bubble"))).toBe(false);
    expect(personaAutoSeedAdmits(stamps("on", "off", "ask-desktop-bubble"), handle("ask-desktop-flat"))).toBe(true);
  });
});
