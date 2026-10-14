import type { Principal } from "@orb/contracts/identity";
import { refineryScorePayloadSchema } from "@orb/contracts/refinery";
import type { WorkloadRunnableRow } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { nextRunnableWorkload, runWorkload } from "@orb/server/domain/workloads";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import type { seedCorpusConnections, seedRecallRoom } from "@orb/testkit/node/corpus-seed.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";

export const QUEUE_OBSERVATION_DELAY_MS = 60_000;
export const WORKLOAD_FUNDER_HEADER = "x-workload-funder";

type CorpusExecution = ReturnType<typeof createCorpusProviderExecution>;
interface FundingWire extends CorpusExecution {
  readonly funders: (string | null)[];
  readonly bodies: string[];
}
export interface HostedFundingRoom {
  readonly chatId: Awaited<ReturnType<typeof seedRecallRoom>>;
  readonly host: Principal;
  readonly connectionId: Awaited<ReturnType<typeof seedCorpusConnections>>["embed"]["id"];
}

export function physicalWire(): FundingWire {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: [...CORPUS_EMBEDDING_VECTOR],
    chatText: "The traveller repairs the loom.",
    structuredReplies: new Map([
      ...CORPUS_STRUCTURED_REPLIES,
      [
        "refinery_score",
        JSON.stringify(
          refineryScorePayloadSchema.parse({
            fieldScores: [{ field: "description", score: 7, strengths: "Clear motive.", weaknesses: "Sparse setting.", suggestions: "Name the habitat." }],
            overallScore: 7,
            priorityImprovements: ["Name the habitat."],
            summary: "The writing gives a concrete motive.",
          }),
        ),
      ],
    ]),
    images: [],
  });
  const funders: (string | null)[] = [];
  const bodies: string[] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
      funders.push(request.headers.get(WORKLOAD_FUNDER_HEADER));
      bodies.push(await request.clone().text());
    }
    return await physical.execute(request);
  };
  return { ...physical, execute, funders, bodies };
}

export async function executeAdmitted(root: ServerTestHarness, id: WorkloadId): Promise<void> {
  const row = await root.services.workloads.get({ caller: null, id });
  if (row.poison) {
    throw new Error("admitted workload has malformed params");
  }
  await executeRow(root, row);
}

export async function executeRow(root: ServerTestHarness, row: WorkloadRunnableRow): Promise<void> {
  await runWorkload(
    {
      db: root.db,
      contributions: root.app.workloadContributions,
      now: root.clock.now,
      audit: root.app.audit,
      emitEvent: root.app.workloadEvents.emitWorkloadEvent,
      heartbeatMs: 0,
      cancelPollMs: 0,
    },
    row,
    new AbortController().signal,
  );
}

export async function observeQueued(root: ServerTestHarness, id: WorkloadId): Promise<WorkloadRunnableRow> {
  let row = await nextRunnableWorkload(root.db, root.app.workloadContributions, root.clock.now() + QUEUE_OBSERVATION_DELAY_MS, "sweep");
  while (row !== null && row.id !== id) {
    await executeRow(root, row);
    row = await nextRunnableWorkload(root.db, root.app.workloadContributions, root.clock.now() + QUEUE_OBSERVATION_DELAY_MS, "sweep");
  }
  if (row === null) {
    throw new Error("admitted workload is absent from the actual queue");
  }
  return row;
}
