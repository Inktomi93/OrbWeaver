import { describe } from "vitest";
import { inLiveWindow } from "../../../../../../packages/server/src/domain/chat/memory/recall/window.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("memory/recall/window — inLiveWindow (the §3a recall window-filter boundary)", () => {
  test("a span starting AT the cutoff is still in the live window (dropped)", () => {
    expect(inLiveWindow(9, 9)).toBe(true);
  });

  test("a span starting STRICTLY BELOW the cutoff has aged out (surfaced)", () => {
    expect(inLiveWindow(8, 9)).toBe(false);
  });

  test("a span well after the cutoff is in the window (dropped)", () => {
    expect(inLiveWindow(100, 9)).toBe(true);
  });

  test("a span well before the cutoff is aged out (surfaced)", () => {
    expect(inLiveWindow(1, 50)).toBe(false);
  });
});
