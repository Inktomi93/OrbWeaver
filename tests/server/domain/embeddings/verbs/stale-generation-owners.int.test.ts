// The boot scan for owners whose stored generation is stale skips an owner whose binding cannot resolve and lets any other
// failure of the lookup reach the detached supervisor, which logs it once and never fails boot.
// @subject packages/server/src/domain/embeddings/verbs/stale-generation-owners.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { connectionBindings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  withheldTable,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

const MISSING_TABLE = "no such table";
const LOG_SCAN_LIMIT = 200;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });

test("an owner whose binding is cleared is skipped, and a failed binding lookup is logged once by the boot supervisor without failing it", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute, logLevel: "error", startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const { embed } = await seedCorpusConnections(root, principal);
  // The scan reads only owners that hold a stored target, which the first index run records.
  await caller.character.create({
    input: createCharacterSchema.parse({ handle: "ledger-keeper", name: "Ledger keeper", description: "Preserves the orbital ledger." }),
  });
  const job = await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" });
  await executeAdmitted(root, job.id);
  await expect.poll(async () => (await caller.workloads.get({ id: job.id })).status).toBe("succeeded");
  await root.settleBackground();

  const sweep = async (): Promise<void> => {
    root.app.detachStaleSpaceReindex();
    await root.settleBackground();
  };
  const faultLogs = (): number =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.level === "error" && record.err?.message.includes(MISSING_TABLE) === true).length;
  const logsBefore = faultLogs();

  await sweep();
  expect(faultLogs()).toBe(logsBefore);

  // An owner whose binding is cleared has nothing to embed with: the scan skips it without a word.
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: null });
  await sweep();
  expect(faultLogs()).toBe(logsBefore);
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: embed.id });

  // Any other failure of the lookup reaches the detached supervisor, which logs it once; the sweep itself returns.
  {
    await using _fault = await withheldTable(root.db, connectionBindings);
    await sweep();
    expect(faultLogs() - logsBefore).toBe(1);
  }
  await sweep();
  expect(faultLogs() - logsBefore).toBe(1);
});
