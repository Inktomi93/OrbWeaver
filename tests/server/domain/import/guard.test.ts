// requireProfile — assert the profile-wave deps are wired. Pins the load-bearing claim: a card-only ctx
// (profile undefined) throws LOUD (a composition bug, never a user error); a wired ctx returns the deps.

import { describe } from "vitest";
import type { ImportContext } from "../../../../packages/server/src/domain/import/context.ts";
import type { ImportProfileDeps } from "../../../../packages/server/src/domain/import/contract/service.ts";
import { requireProfile } from "../../../../packages/server/src/domain/import/guard.ts";
import { expect, test } from "../../../support/fixtures.ts";

describe("requireProfile", () => {
  test("throws loud when ctx.profile is not wired (a card-only slice reaching a chats/personas verb)", () => {
    // @orb-waive no-test-fabrication(unknown): minimal ImportContext double — only `profile` is read by this assertion. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const ctx = { profile: undefined } as unknown as ImportContext;
    expect(() => requireProfile(ctx)).toThrow(/ctx\.profile not wired/);
  });

  test("returns the wired profile deps verbatim when present", () => {
    // @orb-waive no-test-fabrication(ImportProfileDeps): an opaque profile-deps marker — requireProfile only checks presence/absence, never reads through it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const profile = {} as ImportProfileDeps;
    // @orb-waive no-test-fabrication(unknown): minimal ImportContext double — only `profile` is read by this assertion. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const ctx = { profile } as unknown as ImportContext;
    expect(requireProfile(ctx)).toBe(profile);
  });
});
