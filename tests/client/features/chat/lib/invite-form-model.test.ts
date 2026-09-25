// The invite-mint form's WIRE PROJECTION — specifically that it states both bounds OUT LOUD.
//
// WHY THIS FILE EXISTS (2026-09-07). `createInvite`'s verb gained safe-by-default bounds: an OMITTED
// `maxUses`/`expiresAt` now means single-use + 48h instead of unlimited + never. This form's own defaults are
// the exact opposite (`expiry: "never"`, `maxUses: null` = unlimited), and it used to express BOTH by
// omitting the field — a spread guarded on `=== null`. So the safe default would have silently overridden
// the picker: the dialog showing "Never expires" while the row it minted died in 48 hours, single-use.
//
// Nothing caught that, because the server change and this projection are different packages and no test
// asserted the payload's SHAPE. That is what these pin: not the values alone, but that the keys are PRESENT
// carrying explicit `null`. A future refactor back to conditional spreads reds here.

import { SIGNUP_MAX_USES } from "@orb/contracts/chat";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { INVITE_FORM_DEFAULTS, toCreateInviteInput, validateInviteForm } from "../../../../../packages/client/src/features/chat/lib/invite-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A fixed submit-time clock — the projection resolves expiry presets against it. */
const NOW = 1_700_000_000_000;
const MS_PER_HOUR = 3_600_000;

describe("toCreateInviteInput — the bounds are stated, never omitted", () => {
  test("the form's OWN defaults (never-expires, unlimited) project as EXPLICIT nulls", () => {
    const input = toCreateInviteInput(INVITE_FORM_DEFAULTS, NOW);

    // The regression this file exists for: `undefined` here is the verb's single-use 48h default, which is
    // the opposite of what the picker says. `toBeNull` alone would pass on a missing key, so the key's
    // PRESENCE is asserted separately.
    expect(Object.hasOwn(input, "maxUses")).toBe(true);
    expect(Object.hasOwn(input, "expiresAt")).toBe(true);
    expect(input.maxUses).toBeNull();
    expect(input.expiresAt).toBeNull();
  });

  test("a chosen expiry preset resolves to an absolute epoch against the submit clock", () => {
    const input = toCreateInviteInput({ ...INVITE_FORM_DEFAULTS, expiry: "24h", maxUses: 3 }, NOW);

    expect(input.expiresAt).toBe(NOW + 24 * MS_PER_HOUR);
    expect(input.maxUses).toBe(3);
  });

  test("an unknown expiry key falls back to never — and says so explicitly", () => {
    const input = toCreateInviteInput({ ...INVITE_FORM_DEFAULTS, expiry: "not-a-preset" }, NOW);

    expect(input.expiresAt).toBeNull();
  });

  test("link mode carries no handle; handle mode brands the trimmed draft", () => {
    expect(toCreateInviteInput(INVITE_FORM_DEFAULTS, NOW).invitedHandle).toBeUndefined();
    expect(toCreateInviteInput({ ...INVITE_FORM_DEFAULTS, mode: "handle", handle: castId<Handle>("  someone  ") }, NOW).invitedHandle).toBe("someone");
  });
});

// D254 — a sign-up link: the switch rides the wire only for a share link, and the form refuses a shape the
// server would refuse (no use limit or over the cap, no expiry or over the cap) before any wire call.
// The fields the validator refuses, in order; none when it passes.
function failingFields(values: Parameters<typeof validateInviteForm>[0]): string[] {
  const result = validateInviteForm(values);
  return result === undefined ? [] : Object.keys(result.fields);
}

describe("the sign-up link", () => {
  const Signup = { ...INVITE_FORM_DEFAULTS, allowSignup: true, expiry: "7d", maxUses: SIGNUP_MAX_USES };

  test("a share link with the switch on asks for sign-up; the default and handle mode never do", () => {
    expect(toCreateInviteInput(Signup, NOW).allowSignup).toBe(true);
    expect(Object.hasOwn(toCreateInviteInput(INVITE_FORM_DEFAULTS, NOW), "allowSignup")).toBe(false);
    const handleMode = toCreateInviteInput({ ...Signup, mode: "handle", handle: castId<Handle>("someone") }, NOW);
    expect(Object.hasOwn(handleMode, "allowSignup")).toBe(false);
  });

  test("the caps: a capped expiry and 1 to the maximum uses pass", () => {
    expect(validateInviteForm(Signup)).toBeUndefined();
    expect(validateInviteForm({ ...Signup, expiry: "1h", maxUses: 1 })).toBeUndefined();
  });

  test("an unlimited or over-cap use count fails on maxUses", () => {
    expect(failingFields({ ...Signup, maxUses: null })).toEqual(["maxUses"]);
    expect(failingFields({ ...Signup, maxUses: SIGNUP_MAX_USES + 1 })).toEqual(["maxUses"]);
  });

  test("no expiry, or an unknown preset, fails on expiry", () => {
    expect(failingFields({ ...Signup, expiry: "never" })).toEqual(["expiry"]);
    expect(failingFields({ ...Signup, expiry: "not-a-preset" })).toEqual(["expiry"]);
  });

  test("control: the same unlimited, never-expiring values pass when the switch is off", () => {
    expect(validateInviteForm({ ...Signup, allowSignup: false, expiry: "never", maxUses: null })).toBeUndefined();
  });
});
