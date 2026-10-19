// requireProfile — assert the profile-wave deps are wired. Pins the load-bearing claim: a card-only ctx
// (profile undefined) throws LOUD (a composition bug, never a user error); a wired ctx returns the deps.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { ImportContext } from "#server/domain/import/context.ts";
import type { ImportProfileDeps } from "#server/domain/import/contract/service.ts";
import { requireProfile } from "#server/domain/import/guard.ts";

describe("requireProfile", () => {
  test("throws loud when ctx.profile is not wired (a card-only slice reaching a chats/personas verb)", () => {
    const ctx = { profile: undefined } as unknown as ImportContext;
    expect(() => requireProfile(ctx)).toThrow(/ctx\.profile not wired/);
  });

  test("returns the wired profile deps verbatim when present", () => {
    const profile = {} as ImportProfileDeps;
    const ctx = { profile } as unknown as ImportContext;
    expect(requireProfile(ctx)).toBe(profile);
  });
});
