// The folder preview's run answers only the workload it is on. An event from a run the owner superseded, or from an
// upload that already ended, never finishes or advances the run that replaced it, and an answer changed while the folder
// is still being read is judged when that read ends. Each case drives the real hook against the composed server; the hook
// is read from one render, so its refs and its requests, not React state, are what a case observes.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ImportPreview, PersonaCollisionChoice } from "@orb/contracts/import";
import { encodePersonaCollisionChoices, importPreviewListOf, importStartedSchema, PERSONA_COLLISION_FIELD, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { WorkloadId } from "@orb/kit/ids";
import { AppDataProviders, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";
import type { LibraryImport } from "#client/features/workloads/hooks/use-library-import.ts";
import { useLibraryImport } from "#client/features/workloads/hooks/use-library-import.ts";
import { asBundleCounts, asImportPreview } from "#client/features/workloads/lib/portability-model.ts";

const COLLISION_KEY = "mara";
const KEEP_BOTH = "keep-both" satisfies PersonaCollisionChoice;
const PRESET = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You are plain.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
});

function pickedFile(path: string, text: string): File {
  const file = new File([text], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

/** A picked folder the planner sends as one upload: a settings file and a preset. */
function folder(): File[] {
  return [
    pickedFile(`profile/${ST_SETTINGS_FILE}`, JSON.stringify({ ["power_user"]: { personas: {} } })),
    pickedFile("profile/OpenAI Settings/Plain.json", PRESET),
  ];
}

/** What a dry run reports of an empty folder: an event only has to carry a valid preview. */
function emptyPreview(): ImportPreview {
  const none = importPreviewListOf([]);
  return {
    kinds: { characters: none, chats: none, personas: none, worlds: none, presets: none, themes: none, backgrounds: none, groups: none, orphans: none },
    skipped: { total: 0, items: [] },
  };
}

function CaptureHook({ rendered }: { readonly rendered: LibraryImport[] }): null {
  rendered.push(useLibraryImport());
  return null;
}

/** The hook as one render hands it out. The refs behind its callbacks are the same ones a mounted page would use. */
function renderedHook(): LibraryImport {
  const runtime = createClientRuntime();
  const rendered: LibraryImport[] = [];
  // biome-ignore lint/correctness/noChildrenProp: The native createElement overload requires the provider's required children prop in its props argument.
  renderToString(createElement(AppDataProviders, { runtime, children: createElement(CaptureHook, { rendered }) }));
  runtime.queryClient.clear();
  const [hook] = rendered;
  if (hook === undefined) {
    throw new Error("The production data providers did not render the import hook");
  }
  return hook;
}

const SERVER_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;

/** Sends the page's requests to the composed server, and notes each dry-run upload the hook sends and the workload
 *  the server admits for it. */
function routeThroughServer(root: ServerTestHarness): { readonly uploads: FormData[]; readonly admitted: WorkloadId[] } {
  const uploads: FormData[] = [];
  const admitted: WorkloadId[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}): Promise<Response> => {
    const isUpload = input === PORTABILITY_ROUTES.importTree && init.method === "POST";
    if (isUpload && init.body instanceof FormData) {
      uploads.push(init.body);
    }
    const response = await root.http.request(input, init);
    if (isUpload && response.ok) {
      admitted.push(importStartedSchema.parse(await response.clone().json()).workloadId);
    }
    return response;
  });
  return { uploads, admitted };
}

test("an event of a run the owner superseded cannot finish the run that replaced it", async () => {
  await using root = await createServerHarness(SERVER_OPTIONS);
  const { uploads, admitted } = routeThroughServer(root);
  using _fetch = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
  const hook = renderedHook();
  // A run still waiting out a refused upload would retry into the next case's server.
  using _stopped = { [Symbol.dispose]: () => hook.cancel() };

  hook.stageFolder(folder());
  await vi.waitFor(() => expect(admitted).toHaveLength(1), { timeout: WORKLOAD_DEADLINE_MS });
  // Picking the folder again supersedes the first run: its upload is cancelled and a second run starts.
  hook.stageFolder(folder());
  await vi.waitFor(() => expect(admitted).toHaveLength(2), { timeout: WORKLOAD_DEADLINE_MS });
  const [superseded, live] = admitted;
  if (superseded === undefined || live === undefined) {
    throw new Error("Both runs were admitted");
  }
  const sent = uploads.length;

  // The late event of the first run, then an answer: a run it finished would judge the personas again.
  hook.previewTrack(superseded).onSucceeded(asBundleCounts(null), emptyPreview());
  hook.chooseCollision(COLLISION_KEY, KEEP_BOTH);
  expect(uploads).toHaveLength(sent);

  // The control: the live run's own event ends it, and the answer given meanwhile is judged then.
  hook.previewTrack(live).onSucceeded(asBundleCounts(null), emptyPreview());
  expect(uploads).toHaveLength(sent + 1);
});

test("an answer changed while the folder is still being read is judged when that read ends", async () => {
  await using root = await createServerHarness(SERVER_OPTIONS);
  const { uploads, admitted } = routeThroughServer(root);
  using _fetch = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
  const hook = renderedHook();
  // A run still waiting out a refused upload would retry into the next case's server.
  using _stopped = { [Symbol.dispose]: () => hook.cancel() };

  hook.stageFolder(folder());
  await vi.waitFor(() => expect(admitted).toHaveLength(1), { timeout: WORKLOAD_DEADLINE_MS });
  const [reading] = admitted;
  if (reading === undefined || root.runAdmittedWorkload === undefined) {
    throw new Error("The folder's dry run was admitted and the harness runs workloads");
  }
  hook.chooseCollision(COLLISION_KEY, KEEP_BOTH);
  // Nothing is judged yet: the folder has no preview an answer could amend.
  expect(uploads).toHaveLength(1);

  await root.runAdmittedWorkload(reading, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: reading });
  const preview = asImportPreview(row.kind === "import-st" && !row.poison ? row.result : null);
  if (preview === null) {
    throw new Error("The dry run has no preview");
  }
  hook.previewTrack(reading).onSucceeded(asBundleCounts(row.kind === "import-st" && !row.poison ? row.result : null), preview);

  // The read ended under other answers than the owner's now: the personas go up again as a dry run under them.
  expect(uploads).toHaveLength(2);
  expect(uploads[1]?.getAll(PERSONA_COLLISION_FIELD)).toEqual(encodePersonaCollisionChoices({ [COLLISION_KEY]: KEEP_BOTH }));
});
