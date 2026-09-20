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

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import { tmpdir } from "node:os";
import type { Principal } from "@orb/contracts/identity";
import { providerIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import type { ConnectionBindingId, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createServices } from "@orb/server/entry/compose";
import { describe, vi } from "vitest";
import { createPersonaSeedLatch } from "../../../../packages/server/src/entry/compose/assets-character.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { seedUser } from "../../../support/factories/index.ts";
import { TEST_BASE_URL, TEST_CONNECTION_ID, TEST_PROVIDER_ID } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";

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

// ── THE PICK LAW (#461). `createPersonaSeedLatch` is the composed ops the seeder is wired with; these run it
// over the REAL settings + persona services, which is the only place the law is observable — the composed
// `ensureSeeded` above is force-OFF in this env, so the automation arm can never reach `markSeeded` here.
// FENCE, not a defect proof: the `=== null` guards predate #461 and the live duplicate happened because BOTH
// pointers were genuinely null (the whole settings blob had come back at schema defaults), not because a pick
// was overwritten. These pin the guards so the next reader cannot "simplify" them away.

describe("createPersonaSeedLatch — the seeder never relitigates a persona pick", () => {
  test("an explicit currentPersonaId + defaultPersonaId both survive markSeeded", async ({ db, services }) => {
    const user = (await seedUser(db, { handle: castId("picker") })).id;
    const principal = principalOf(user);
    const mine = await services.persona.create({ principal, input: { name: "Sarah", description: "a persona I made myself" } });
    await services.settings.updateUserSettingsSection({
      principal,
      input: { section: "seeds", patch: { defaultPersonaId: mine.id, currentPersonaId: mine.id } },
    });
    const latch = createPersonaSeedLatch({ settings: services.settings, getPersona: () => services.persona });

    await latch.markSeeded(principal, castId<PersonaId>("persona_seeder_would_point_here"));

    const config = (await services.settings.getUserSettings({ principal })).config;
    expect(config.onboarding.defaultPersonaSeeded).toBe(true); // the latch still lands
    expect(config.seeds.defaultPersonaId).toBe(mine.id);
    expect(config.seeds.currentPersonaId).toBe(mine.id);
  });

  test("the two pointers are decided INDEPENDENTLY — a pinned default keeps its pick, an unset current is filled", async ({ db, services }) => {
    const user = (await seedUser(db, { handle: castId("halfpicker") })).id;
    const principal = principalOf(user);
    const mine = await services.persona.create({ principal, input: { name: "Sarah", description: "a persona I made myself" } });
    await services.settings.updateUserSettingsSection({ principal, input: { section: "seeds", patch: { defaultPersonaId: mine.id } } });
    const latch = createPersonaSeedLatch({ settings: services.settings, getPersona: () => services.persona });
    const seeded = castId<PersonaId>("persona_the_seeder_just_made");

    await latch.markSeeded(principal, seeded);

    const config = (await services.settings.getUserSettings({ principal })).config;
    expect(config.seeds.defaultPersonaId).toBe(mine.id);
    expect(config.seeds.currentPersonaId).toBe(seeded);
  });

  // #1412 — THE ORDER IS THE INVARIANT, and this is a defect proof, not a fence. `markSeeded` used to write
  // `onboarding.defaultPersonaSeeded: true` FIRST and the `seeds.*` pointers in a SECOND update: a crash
  // between them left a created persona with no pointers while the committed latch permanently suppressed
  // re-seeding (`isSeeded` short-circuits `seed()` before layer 2 is ever consulted). The latch is the LAST
  // write now, so it means "complete" — an interruption leaves the pass retryable and loses nothing.
  test("a crash BETWEEN the two settings writes leaves the seed RETRYABLE — the latch never lands first", async ({ db, services }) => {
    const user = (await seedUser(db, { handle: castId("interrupted") })).id;
    const principal = principalOf(user);
    const seeded = castId<PersonaId>("persona_the_seeder_just_made");
    let writes = 0;
    const flakySettings = {
      getUserSettings: (args: Parameters<typeof services.settings.getUserSettings>[0]): ReturnType<typeof services.settings.getUserSettings> =>
        services.settings.getUserSettings(args),
      updateUserSettingsSection: async (
        args: Parameters<typeof services.settings.updateUserSettingsSection>[0],
      ): ReturnType<typeof services.settings.updateUserSettingsSection> => {
        writes += 1;
        if (writes === 2) {
          throw new Error("cb-1412 probe: the process died between the two settings writes");
        }
        return await services.settings.updateUserSettingsSection(args);
      },
    };
    const latch = createPersonaSeedLatch({ settings: flakySettings, getPersona: () => services.persona });

    await expect(latch.markSeeded(principal, seeded)).rejects.toThrow(/died between the two settings writes/u);

    const config = (await services.settings.getUserSettings({ principal })).config;
    // The latch is a COMPLETENESS claim: an interrupted mark must leave the user re-seedable.
    expect(config.onboarding.defaultPersonaSeeded).toBe(false);
    // …and the half that DID land is the pointers, so the created persona is already reachable.
    expect(config.seeds.defaultPersonaId).toBe(seeded);
    expect(config.seeds.currentPersonaId).toBe(seeded);
  });

  // #1412, the other half of "the latch means complete": the layer-2 heal now REPAIRS null pointers instead
  // of leaving them null forever. FENCE at THIS tier (it passed pre-fix — `markSeeded` always filled null
  // pointers when handed an id; the defect was that the heal never handed one over), and the defect proof
  // lives one tier up at `tests/server/entry/boot/seed-default-persona.int.test.ts` — "a LOST latch does not
  // mint a second default persona", whose second mark used to carry `null`. FORK, stated: the prior comment on this factory read "the surviving row's
  // id is NOT handed over: pointing seeds.defaultPersonaId/currentPersonaId at it here would relitigate a
  // pick the user may have made", and the pin that encoded it asserted `markSeeded(principal, null)` moves no
  // pointer. That mechanism is PRESERVED exactly — the `=== null` guards below are the same PICK LAW guards,
  // so an explicit pick is still untouchable — but its premise does not hold for a pointer that is NULL: the
  // #461 incident this heal exists for is a settings blob that came back at schema defaults, which nulls the
  // pointers too, and leaving them null is the incomplete state the row asks to have repaired on next boot.
  test("the layer-2 heal REPAIRS null pointers at the surviving artifact, and still never moves a pick", async ({ db, services }) => {
    const user = (await seedUser(db, { handle: castId("healed") })).id;
    const principal = principalOf(user);
    const latch = createPersonaSeedLatch({ settings: services.settings, getPersona: () => services.persona });
    const survivor = await services.persona.create({
      principal,
      input: { name: "Traveler", description: "the seeded one that outlived its latch", metadata: { seededDefault: true } },
    });

    await latch.markSeeded(principal, survivor.id);

    const config = (await services.settings.getUserSettings({ principal })).config;
    expect(config.onboarding.defaultPersonaSeeded).toBe(true);
    expect(config.seeds.defaultPersonaId).toBe(survivor.id);
    expect(config.seeds.currentPersonaId).toBe(survivor.id);
  });

  test("findSeededDefault returns the seeder's artifact id and nothing else", async ({ db, services }) => {
    const user = (await seedUser(db, { handle: castId("artifact") })).id;
    const principal = principalOf(user);
    const latch = createPersonaSeedLatch({ settings: services.settings, getPersona: () => services.persona });

    // A library of the user's OWN personas never suppresses the seed — the recorded ruling this fix preserves.
    await services.persona.create({ principal, input: { name: "Traveler", description: "same name, mine" } });
    expect(await latch.findSeededDefault(principal)).toBeNull();

    const seeded = await services.persona.create({
      principal,
      input: { name: "Traveler", description: "the seeded one", metadata: { seededDefault: true } },
    });
    expect(await latch.findSeededDefault(principal)).toBe(seeded.id);
  });
});

// ── #759 — resolveGreetingTemplate's preset-read catch narrows to PresetNotFoundError, END TO END ──────────
// `resolveGreetingTemplate` (compose/assets-character.ts) reads the caller's default-preset guided-action
// template BEFORE the bounded side-LLM completion runs — reachable through `character.generateGreeting`.
// `app.roleClients`/`services.preset` are the SAME instances the composed `AssetsCharacterComposeDeps`
// closes over (compose-observe-via-service-spyon), so spying on them intercepts the real injected reads.
describe("compose/assets-character.ts — resolveGreetingTemplate narrows to PresetNotFoundError (#759)", () => {
  const fakeGreetingText = "a fake greeting";
  const fakeSummary = { items: [{ text: fakeGreetingText, usage: { tokensIn: null, tokensOut: null, costUsd: null } }], model: "test-model" };

  test("a non-not-found preset rejection PROPAGATES before any completion runs", async ({ db, app, services }) => {
    const owner = (await seedUser(db, { handle: castId("greethost1") })).id;
    const principal = principalOf(owner);
    const created = await services.character.create({ principal, input: { handle: castId("aria-greet1"), name: "Aria", description: "a card" } });
    await services.settings.updateUserSettingsSection({
      principal,
      input: { section: "seeds", patch: { defaultPresetId: castId<PresetId>("preset_greet_will_error") } },
    });
    const dbDown = new Error("preset store unreachable");
    vi.spyOn(services.preset, "get").mockRejectedValueOnce(dbDown);
    const summarizeSpy = vi.spyOn(await app.roleClientsFor(owner), "summarize").mockResolvedValue(fakeSummary);

    await expect(services.character.generateGreeting({ principal, characterId: created.id, steer: "cheerful" })).rejects.toBe(dbDown);
    // The propagation happened BEFORE the completion — the fallback-and-continue defect would have reached it.
    expect(summarizeSpy).not.toHaveBeenCalled();
  });

  // §8.5b — `generateGreetingText` now resolves its `summarize` connection through the REAL per-funder
  // `roleClientsFor` bind, and NO default connection exists any more (F2/F16/D142 retired), so reaching the
  // completion needs a seeded binding — a `NoConnectionError` otherwise. A post-compose instance-spy
  // (`app.roleClientsFor(owner)`, then spy its `summarize`) no longer intercepts anything: `roleClientsFor`
  // mints a FRESH bundle on every call (§7.5-1b). A `globalThis.fetch` spy fails the same way one level
  // lower — `buildBackends` resolves `deps.sdkFetch ?? globalThis.fetch` ONCE, inside `createServices` (the
  // shared `app` fixture's OWN setup, which runs before this test's body), so the captured reference is the
  // pre-spy one (proven live: an unmocked run reached the box's real :8703 vLLM engine and got its real
  // "model does not exist" answer). So THIS test builds its OWN composed graph — still the real seam,
  // `createServices` end to end — with the fake fetch wired in from the start via `providerSeams.sdkFetch`.
  test("a genuinely stale/unowned default preset id still degrades to the contract default template", async () => {
    const db = await freshDb();
    const clock = createFrozenClock();
    // The wire body's field names are OpenAI's, not ours — a raw JSON string sidesteps
    // `useNamingConvention` on an object literal whose keys this test does not own.
    const wireBody = `{"id":"chatcmpl-test","choices":[{"index":0,"message":{"role":"assistant","content":${JSON.stringify(fakeGreetingText)}},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`;
    const fakeFetch: typeof fetch = () => Promise.resolve(new Response(wireBody, { status: 200, headers: { "content-type": "application/json" } }));
    const { services } = await createServices({
      db,
      now: clock.now,
      ownerId: castId<UserId>("user_greet_owner"),
      secretBoxKey: null,
      casDir: tmpdir(),
      variantDir: tmpdir(),
      sessionSecret: "test-session-secret-at-least-32-chars",
      providerSeams: { sdkFetch: fakeFetch },
    });

    const owner = (await seedUser(db, { handle: castId("greethost2") })).id;
    const principal = principalOf(owner);
    const created = await services.character.create({ principal, input: { handle: castId("bryn-greet2"), name: "Bryn", description: "a card" } });
    await services.settings.updateUserSettingsSection({
      principal,
      input: { section: "seeds", patch: { defaultPresetId: castId<PresetId>("preset_greet_gone_forever") } },
    });
    await db.insert(userConnections).values({
      id: TEST_CONNECTION_ID,
      ownerId: owner,
      label: "greeting studio test connection",
      providerId: providerIdSchema.parse(TEST_PROVIDER_ID),
      baseUrl: TEST_BASE_URL,
      model: "test-model",
    });
    await db.insert(connectionBindings).values({
      id: castId<ConnectionBindingId>("connection_binding_greet2"),
      actorKind: "user",
      userId: owner,
      ruleId: null,
      pluginId: null,
      task: "summarize",
      connectionId: TEST_CONNECTION_ID,
    });

    const result = await services.character.generateGreeting({ principal, characterId: created.id, steer: "cheerful" });
    expect(result.text).toBe(fakeGreetingText);
  });
});
