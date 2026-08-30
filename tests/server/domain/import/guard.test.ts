// requireProfile — assert the profile-wave deps are wired. Pins the load-bearing claim: a card-only ctx
// (profile undefined) throws LOUD (a composition bug, never a user error); a wired ctx returns the deps.

import { describe } from "vitest";
import type { ImportContext } from "../../../../packages/server/src/domain/import/context.ts";
import type { ImportProfileDeps } from "../../../../packages/server/src/domain/import/contract/service.ts";
import { requireProfile } from "../../../../packages/server/src/domain/import/guard.ts";
import { expect, test } from "../../../support/fixtures.ts";

describe("requireProfile", () => {
  test("throws loud when ctx.profile is not wired (a card-only slice reaching a chats/personas verb)", () => {
    // FABRICATION-OK: minimal ImportContext double — only `profile` is read by this assertion.
    const ctx = { profile: undefined } as unknown as ImportContext;
    expect(() => requireProfile(ctx)).toThrow(/ctx\.profile not wired/);
  });

  test("returns the wired profile deps verbatim when present", () => {
    // FABRICATION-OK: an opaque profile-deps marker — requireProfile only checks presence/absence, never reads through it.
    const profile = {} as ImportProfileDeps;
    // FABRICATION-OK: minimal ImportContext double — only `profile` is read by this assertion.
    const ctx = { profile } as unknown as ImportContext;
    expect(requireProfile(ctx)).toBe(profile);
  });
});
