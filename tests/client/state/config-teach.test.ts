// The R-TEACH honesty pins (#866 S3) — the mirror of the compose door's
// `assertTeachHonesty` sweep. tsc makes `teach` unforgettable on a leaf; these arms make it unfakeable,
// each proven by a PLANTED fixture in both directions (an honest one passes; each hollow flavour throws).
// The DERIVED-POPULATION arm — the sweep over the REAL door's leaves, never a hand list — rides the
// live-door mirror in `config-section-partition.test.ts` (one mirror list serves both door asserts).

import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution, ConfigSettingRef, SettingTeachDecl } from "@orb/client/state";
import { assertTeachHonesty, isTeachNone } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const EMPTY_SUMMARY = /empty summary/;
const EMPTY_AFFECTS = /empty "affects" list or a blank entry/;
const NONE_NO_REASON = /opts out without a reason/;
const UNKNOWN_GROUP = /unknown group/;
const UNRENDERED_SUB = /no contribution renders/;
const UNDECLARED_SETTING = /does not declare/;

/** A contribution with ONE leaf carrying the given teach declaration. */
function withLeaf(teach: SettingTeachDecl, related?: readonly ConfigSettingRef[]): ConfigSectionContribution {
  const decl = related === undefined || isTeachNone(teach) ? teach : { ...teach, related };
  return {
    id: "t",
    anchor: "appearance",
    nav: { id: "t-sub", label: "T", settings: [{ id: "t-leaf", label: "T leaf", teach: decl }] },
    body: () => "node:t",
  };
}

function registryOf(...contributions: ConfigSectionContribution[]): Parameters<typeof assertTeachHonesty>[0] {
  return createContributorRegistry<ConfigSectionContribution>("t", contributions);
}

const HONEST: SettingTeachDecl = { summary: "A real lesson.", affects: ["a real surface"] };

describe("assertTeachHonesty", () => {
  test("an honest teach passes; an honest none passes", () => {
    expect(() => assertTeachHonesty(registryOf(withLeaf(HONEST)))).not.toThrow();
    expect(() => assertTeachHonesty(registryOf(withLeaf({ none: "a verb row — the section lesson covers it" })))).not.toThrow();
  });

  test("PLANTED RED: an empty summary throws", () => {
    expect(() => assertTeachHonesty(registryOf(withLeaf({ summary: "  ", affects: ["x"] })))).toThrow(EMPTY_SUMMARY);
  });

  test("PLANTED RED: an empty affects list — and a blank entry — throw", () => {
    expect(() => assertTeachHonesty(registryOf(withLeaf({ summary: "s", affects: [] })))).toThrow(EMPTY_AFFECTS);
    expect(() => assertTeachHonesty(registryOf(withLeaf({ summary: "s", affects: ["ok", " "] })))).toThrow(EMPTY_AFFECTS);
  });

  test("PLANTED RED: a reasonless {none} throws", () => {
    expect(() => assertTeachHonesty(registryOf(withLeaf({ none: "" })))).toThrow(NONE_NO_REASON);
  });

  test("PLANTED RED: a related ref that resolves to nothing throws, in all three flavours", () => {
    // A deliberately wrong group id (`as never` — unspellable in the union): the arm under test IS the resolution failure.
    expect(() => assertTeachHonesty(registryOf(withLeaf(HONEST, [{ group: "not-a-group" as never, sub: "x", setting: "y" }])))).toThrow(UNKNOWN_GROUP);
    expect(() => assertTeachHonesty(registryOf(withLeaf(HONEST, [{ group: "appearance", sub: "no-such-sub", setting: "y" }])))).toThrow(UNRENDERED_SUB);
    expect(() => assertTeachHonesty(registryOf(withLeaf(HONEST, [{ group: "appearance", sub: "t-sub", setting: "no-such-leaf" }])))).toThrow(
      UNDECLARED_SETTING,
    );
  });

  test("a ref to a sibling's REAL leaf resolves", () => {
    const target: ConfigSectionContribution = {
      id: "u",
      anchor: "chat-behavior",
      nav: { id: "u-sub", label: "U", settings: [{ id: "u-leaf", label: "U leaf", teach: HONEST }] },
      body: () => "node:u",
    };
    expect(() => assertTeachHonesty(registryOf(withLeaf(HONEST, [{ group: "chat-behavior", sub: "u-sub", setting: "u-leaf" }]), target))).not.toThrow();
  });
});
