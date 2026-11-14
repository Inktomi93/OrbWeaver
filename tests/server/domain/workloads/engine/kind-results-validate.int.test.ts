// Every workload kind's happy path, run by the real runner, stores a result its kind's own schema accepts: the runner
// refuses any other (`runner-result-validation.int.test.ts`), so a kind whose run builds a result its schema rejects
// fails here as a failed row. The case table is keyed by `WorkloadKind`, so a new kind without a case fails `tsc`.
// A kind starts through its own door where it has one (the tree upload, the bundle upload, a databank document) and
// through `workloads.start` otherwise, on a library that holds only what its case seeds.
// @subject packages/server/src/domain/workloads/engine/runner.ts

import { importStartedSchema, ST_SETTINGS_FILE, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { StartWorkloadInput, WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES, WORKLOAD_KINDS, workloadResultSchemaOf } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import { admit, CHAT, cardPng, harness, settings, WORLD } from "../../import/persistence/_st-tree-door.ts";

type StartCase = (root: ServerTestHarness) => Promise<WorkloadId>;

/** Start a kind through `workloads.start`: singular for the owner where the kind allows it, else the box-wide bulk run. */
function started<K extends WorkloadKind>(kind: K, params: Extract<StartWorkloadInput, { kind: K }>["params"]): StartCase {
  return async (root) => {
    const owner = await root.principalFor(root.ownerId);
    const singular = WORKLOAD_KIND_MODES[kind].singular;
    const ref = await root.services.workloads.start({
      caller: owner,
      ownerId: singular ? owner.userId : null,
      mode: singular ? "singular" : "bulk",
      input: { kind, params } as StartWorkloadInput,
    });
    return ref.id;
  };
}

async function treeDryRun(root: ServerTestHarness): Promise<WorkloadId> {
  return await admit(
    root,
    {
      [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }),
      "characters/Aria.png": cardPng(root, "Aria"),
      "chats/Aria/one.jsonl": CHAT,
      "worlds/Eldoria.json": WORLD,
    },
    [TREE_DRY_RUN_VALUE],
  );
}

async function bundleUpload(root: ServerTestHarness): Promise<WorkloadId> {
  await root.services.preset.create({ userId: root.ownerId, name: "Bundled Preset", kind: "roleplay" });
  const download = await root.http.request(`${PORTABILITY_ROUTES.exportLibrary}?kinds=preset`);
  expect(download.status).toBe(200);
  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, {
    method: "POST",
    headers: CSRF_HEADERS,
    body: new Uint8Array(await download.arrayBuffer()),
  });
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

async function textDocument(root: ServerTestHarness): Promise<WorkloadId> {
  const owner = await root.principalFor(root.ownerId);
  await (await root.internalCallerFor(root.ownerId)).databank.createFromText({ name: "Harbor notes", text: "The lamp is lit at dusk." });
  const [ingest] = await root.services.workloads.list({ caller: owner, kind: "databank-ingest" });
  if (ingest === undefined) {
    throw new Error("a text document queued no ingest");
  }
  return ingest.id;
}

const CASES = {
  index: started("index", { source: "all" }),
  "distill-characters": started("distill-characters", {}),
  "compute-themes": started("compute-themes", {}),
  "memory-backfill": started("memory-backfill", {}),
  "group-character-backfill": started("group-character-backfill", {}),
  "compute-cooccurrence": started("compute-cooccurrence", {}),
  "find-duplicates": started("find-duplicates", {}),
  csls: started("csls", {}),
  "assets-backfill": started("assets-backfill", { dryRun: true }),
  "assets-gc": started("assets-gc", { dryRun: true }),
  "assets-fsck": started("assets-fsck", {}),
  "assets-rebuild-index": started("assets-rebuild-index", { kind: "avatar" }),
  "import-st": treeDryRun,
  "import-token-usage-backfill": started("import-token-usage-backfill", { dryRun: true }),
  "import-bundle": bundleUpload,
  "reconcile-stats": started("reconcile-stats", {}),
  "refresh-model-catalog": started("refresh-model-catalog", {}),
  "reconcile-world-state": started("reconcile-world-state", {}),
  "databank-ingest": textDocument,
  "databank-reindex": started("databank-reindex", { scope: { kind: "owner" } }),
  "refine-score-sweep": started("refine-score-sweep", {}),
} as const satisfies { readonly [K in WorkloadKind]: StartCase };

test.for(WORKLOAD_KINDS)("a %s run stores a result its kind's schema accepts", async (kind) => {
  await using root = await harness();
  const owner = await root.principalFor(root.ownerId);
  const id = await CASES[kind](root);
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }

  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));

  const row = await root.services.workloads.get({ caller: owner, id });
  expect(row).toMatchObject({ kind, status: "succeeded", error: null, poison: false });
  expect(workloadResultSchemaOf(kind).safeParse(row.result).success).toBe(true);
});
