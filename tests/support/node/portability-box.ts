// A local box whose loopback requests act as its owner, and the library export and bundle restore it drives over the
// product's own HTTP routes and workload runner, so a portability case sets up and restores through the real door.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { ModelId, WorkloadId } from "@orb/kit/ids";
import type { SeededIds } from "../iso/ids.ts";
import { CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution } from "./corpus-provider.ts";
import type { ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

/** Any signed-in request runs the first-login seed; this one reads nothing else. */
export const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";

/** How long a case lets an admitted import or sweep workload run before it is aborted. */
export const WORKLOAD_DEADLINE_MS = 60_000;

const LOOPBACK = "127.0.0.1";
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;

export interface SignedInBoxOptions {
  readonly ids?: SeededIds;
  readonly providerFetch?: typeof fetch;
}

/** A local-auth box with no background jobs, after its owner's first-login seed has settled. */
export async function signedInBox(options: SignedInBoxOptions = {}): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => LOOPBACK,
    startJobs: false,
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    ...(options.providerFetch === undefined ? {} : { providerFetch: options.providerFetch }),
  });
  const response = await root.http.request(SIGNED_IN_ROUTE);
  if (response.status !== HTTP_OK) {
    throw new Error(`the first signed-in request answered ${response.status}`);
  }
  await root.settleBackground();
  return root;
}

/** The library export of the owner's `kinds`, or of every kind when none is named. */
export async function exportLibrary(root: ServerTestHarness, kinds?: readonly PortableKind[]): Promise<Uint8Array> {
  const response = await root.http.request(
    kinds === undefined ? PORTABILITY_ROUTES.exportLibrary : `${PORTABILITY_ROUTES.exportLibrary}?kinds=${kinds.join(",")}`,
  );
  if (response.status !== HTTP_OK) {
    throw new Error(`the library export answered ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Upload the bundle and run its import workload to the end; the workload's own status and failure tally. */
export async function restoreBundle(root: ServerTestHarness, bundle: Uint8Array): Promise<{ readonly status: string; readonly failed: number | undefined }> {
  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: Uint8Array.from(bundle) });
  if (response.status !== HTTP_ACCEPTED) {
    throw new Error(`the bundle upload answered ${response.status}`);
  }
  const id: WorkloadId = importStartedSchema.parse(await response.json()).workloadId;
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  if (row.kind !== "import-bundle" || row.poison) {
    throw new Error("the bundle upload left no typed import-bundle workload");
  }
  return { status: row.status, failed: row.result?.failed };
}

/** A scripted provider that answers only an image generation of `model`, with the pictures a case pushes in order. */
export function imageProvider(model: ModelId, pictures: Uint8Array[]): typeof fetch {
  return createCorpusProviderExecution({
    modelIds: [model],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: pictures,
  }).execute;
}
