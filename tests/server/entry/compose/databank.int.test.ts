// entry/compose/databank — the DB6 settings wire, COMPOSED-REAL (real createServices, vLLM disabled — the
// `services` fixture). Manifest ④: prove a `UserSettings.databank` write CHANGES what the gather machinery
// reads, through the ACTUAL composition — not a unit test of the resolver.
//
// WHAT THIS PROVES: the compose `getDatabankSettings(ownerId)` binding (entry/compose/databank.ts) reads the
// host's REAL `UserSettings.databank` via `loadUserSettings`, replacing the former 0-param
// schema-default stub (the compose-stub-goes-stale bug). Each arm invokes the EXACT bound op
// (`bindGetDatabankSettings`, the arrow `buildDatabank` installs on the DatabankContext) AND the settings
// front door, so the binding itself is exercised — not just the round-trip. Writing databank settings through
// the settings front door (`updateUserSettingsSection("databank")`) and reading them back through the SAME
// composed settings service the gather machinery reads through is the faithful, engine-free observation: the gather
// op (`gatherRetrieval`) then passes these to `search.documents` (proven field-for-field in
// domain/databank/verbs/gather-retrieval.int.test.ts), and ForeignInputs carries them from these settings to
// the gather op (domain/chat/substrate/assemble-gather.int.test.ts). The final embed/rank hop needs vLLM
// (disabled here) — the SCOPE BOUNDARY: this pins the settings→read wire, those two pin the read→search
// threading; together they are the whole chain minus the engine-gated cosine scan.
//
// The REVERSE pin (an UNWRITTEN databank section reads the grounded defaults) proves the wire is LIVE — a
// broken binding returning constants regardless of the write would pass the write case vacuously.

import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Services } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { bindGetDatabankSettings } from "../../../../packages/server/src/entry/compose/databank.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedUser } from "../../domain/chat/_support.ts";
import { principal } from "../../domain/settings/_support.ts";

function seedHost(db: Db): Promise<UserId> {
  return seedUser(db, castId<Handle>("dbhost"));
}

describe("databank settings wire — composed-real (createServices)", () => {
  test("an UNWRITTEN databank section reads the grounded defaults (the byte-identity floor)", async ({ services, db }) => {
    const host = await seedHost(db);
    const settings = await services.settings.loadUserSettings(host);
    // The defaults ingest + gather fall to when no override exists (databank-design/05 §3.7).
    expect(settings.databank.retrieval).toEqual({ k: 5, minScore: 0.25, rerank: false });
    expect(settings.databank.chunk.chunkSize).toBe(2500);
    expect(settings.databank.slotTokenBudget).toBe(4096);

    // The EXACT bound compose op (what ingest + gather call) — an unwritten user gets the defaults, NOT the
    // former stub's ownerId-blind constants (which happened to match, but for the wrong reason).
    const bound = bindGetDatabankSettings(services.settings.loadUserSettings)(host);
    expect((await bound).retrieval).toEqual({ k: 5, minScore: 0.25, rerank: false });
    expect((await bound).chunk.chunkSize).toBe(2500);
  });

  test("a databank settings write is what the composed gather machinery reads back (getDatabankSettings source)", async ({ services, db }) => {
    const host = await seedHost(db);
    // Write through the REAL settings front door — a section patch merged into the current defaults, exactly
    // as a client would. The compose `getDatabankSettings(host)` reads `loadUserSettings(host).databank`, so
    // reading it back here observes precisely what the gather op resolves at turn time.
    await writeDatabank(services, host);

    const settings = await services.settings.loadUserSettings(host);
    expect(settings.databank.retrieval).toEqual({ k: 3, minScore: 0.4, rerank: true });
    expect(settings.databank.chunk.chunkSize).toBe(1200);
    expect(settings.databank.slotTokenBudget).toBe(2048);

    // The EXACT bound compose op reflects the write (the stub-kill's whole point): `getDatabankSettings(host)`
    // returns the OWNER's stored `{chunk, retrieval}`, not schema defaults. `slotTokenBudget` is NOT on this
    // op's shape (it rides ForeignInputs) — the op projects exactly the two fields ingest + gather consume.
    const resolved = await bindGetDatabankSettings(services.settings.loadUserSettings)(host);
    expect(resolved.retrieval).toEqual({ k: 3, minScore: 0.4, rerank: true });
    expect(resolved.chunk.chunkSize).toBe(1200);
  });
});

/** Write a full non-default databank section through the composed settings verb. */
function writeDatabank(services: Services, host: UserId): Promise<unknown> {
  return services.settings.updateUserSettingsSection({
    principal: principal(host, "user"),
    input: {
      section: "databank",
      patch: { retrieval: { k: 3, minScore: 0.4, rerank: true }, chunk: { chunkSize: 1200 }, slotTokenBudget: 2048 },
    },
  });
}
