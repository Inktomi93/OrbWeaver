// A plugin source that cannot be fetched or cloned is refused as a client error whose cause the transport does not log;
// the wrapping verb records the cause for the operator.
// @subject packages/server/src/domain/plugin/verbs/preview-from-url.ts
// @subject packages/server/src/domain/plugin/verbs/git-source.ts
// @subject packages/server/src/domain/plugin/substrate/manifest.ts

import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

const UPSTREAM_FAULT = "connection reset by the plugin source";
const BUNDLE_URL = "https://plugins.example.test/ledger.zip";
const GIT_URL = "https://git.example.test/ledger.git";
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });

async function rootWithBrokenSource(): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  return await createServerHarness({
    logLevel: "warn",
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: () => Promise.reject(new Error(UPSTREAM_FAULT)),
    },
  });
}

function recordedCauses(root: Awaited<ReturnType<typeof createServerHarness>>): number {
  return root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn" && record.err?.message.includes(UPSTREAM_FAULT) === true).length;
}

test("a bundle URL that cannot be fetched is a BAD_REQUEST and the log keeps the cause", async () => {
  await using root = await rootWithBrokenSource();
  const rpc = await root.internalCallerFor(root.ownerId);
  expect(recordedCauses(root)).toBe(0);
  await expect(rpc.plugin.previewFromUrl({ url: BUNDLE_URL })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(recordedCauses(root)).toBe(1);
});

test("a git source that cannot be cloned is a BAD_REQUEST and the log keeps the cause", async () => {
  await using root = await rootWithBrokenSource();
  const rpc = await root.internalCallerFor(root.ownerId);
  expect(recordedCauses(root)).toBe(0);
  await expect(rpc.plugin.previewFromGit({ url: GIT_URL })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(recordedCauses(root)).toBe(1);
});
