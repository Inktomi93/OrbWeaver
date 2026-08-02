// entry/compose/assets-character — the COMPOSED default-persona seeder posture (the forced-first-run
// redesign, owner ruling 2026-08-03). The unit arms live at `tests/server/entry/boot/seed-default-persona`
// (both postures, injected); what only this seam can prove is WHICH posture the composition root wires.
//
// The rule: auto-create is ON only for a stack automation started (`E2E_HARNESS=on || DEV_SEED=on` — the two
// stamps a human-started stack does not carry), and OFF everywhere else so a REAL first sign-in reaches the
// zero-personas first-run ask (D107's ruled trigger; the client's `FirstRunPersonaDialog`). Before this, the
// per-request hook minted "Traveler" on the first authed request, so the shipped forced dialog was dead by
// construction — its trigger could never hold.
//
// This file exercises the REAL-STACK arm, which is what the test env IS: `foundation/env` parses ONCE at
// module load, so a per-test `vi.stubEnv` cannot flip the composed knob (the automation arm is the injected
// unit test's job). The two calls below are the seeder's TWO trigger sites — boot-owner (`lifecycle.ts` →
// `seedDefaultPersona`) and every user's first authed request (`app.ts` → `seedUserCharacters`) — and the
// force must gate BOTH, or the deployment owner is the one user who never gets asked.

import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { seedUser } from "../../../support/factories/index.ts";
import { expect, test } from "../../../support/fixtures";

function principalOf(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("firstrun"), externalId: null, via: "header" };
}

describe("the composed default-persona seeder — the real-stack (forced first-run) posture", () => {
  test("a REAL stack seeds NO persona for a fresh user — the zero-personas first-run ask holds", async ({ db, app, services }) => {
    const user = (await seedUser(db, { handle: castId("firstrun") })).id;
    const principal = principalOf(user);

    // The per-user first-authed-request hook (and the boot-owner step) both land here.
    await app.personaSeeder.ensureSeeded(principal);

    // The state the forced dialog triggers on: an EMPTY library. On an auto-seeding stack this is 1
    // ("Traveler") and the dialog can never open.
    expect(await services.persona.list({ principal })).toHaveLength(0);
  });

  test("…and the seeds pointers stay unset, so nothing pretends the user has picked an identity", async ({ db, app, services }) => {
    const user = (await seedUser(db, { handle: castId("firstrun2") })).id;
    const principal = principalOf(user);

    await app.personaSeeder.ensureSeeded(principal);

    const seeds = (await services.settings.getUserSettings({ principal })).config.seeds;
    expect(seeds.currentPersonaId).toBeNull();
    expect(seeds.defaultPersonaId).toBeNull();
    // The latch is untouched too — a user who later creates their own persona is never "re-seeded", and a
    // stack flipped to an automation posture still seeds honestly.
    expect((await services.settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded).toBe(false);
  });
});
