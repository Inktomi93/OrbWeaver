// entry/compose/portability-runner — the LAST seam: it builds the portability registry and the deps
// `domain/import`'s workload contributions close over. Four of its decisions are load-bearing and are made
// nowhere else:
//
//   • THE STAGING ROOT MUST AGREE WITH THE UPLOAD ROUTES. `entry/http/import.ts` writes the staged zip under
//     `stagedOwnerRoot(deps.stagingDir ?? DEFAULT_IMPORT_STAGING_DIR, uploader)`; the contribution reads
//     under `stagedOwnerRoot(deps.importStagingDir ?? DEFAULT_IMPORT_STAGING_DIR, its row owner)`. If the two
//     defaults ever diverge, every uploaded bundle stages fine and then imports NOTHING — and the root is
//     also the fence the domain resolves staged handles strictly inside, so a wrong root is a
//     path-containment question, not just a plumbing one. The default is app-owned on purpose (#1534): the
//     OS temp dir is a shared namespace, and the per-owner subdir is what stops one account's handle from
//     naming another's staged bytes.
//   • THE ST PROFILE DEFAULT is the gitignored `.st-data` snapshot; a drifted default would point a real
//     `import-st` run at some other directory on the operator's box.
//   • THE THREE BULK RUNS EACH RIDE QUIET MODE and must still RETURN their counts — `withQuietBulkFanout`
//     wraps the run, and a wrapper that swallowed the result would report a vacuous 0/0/0 success for a run
//     that actually wrote canon.
//   • THE TERMINAL LIBRARY FAN (#23) is what refreshes an owner's lists after a BACKGROUND import whose UI
//     was navigated away from. It must publish BOTH events, and — the tenancy half — only onto the target
//     owner's channel.
//
// The registry half is pinned as "composed with the shared slice" (its per-descriptor behaviour is
// `portability.test.ts`'s).

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { WorkloadRef } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CharacterService } from "@orb/server/domain/character";
import { DEFAULT_IMPORT_STAGING_DIR } from "@orb/server/domain/import";
import type { StartWorkloadParams, WorkloadService } from "@orb/server/domain/workloads";
import { WORKLOAD_NOT_ADMISSIBLE } from "@orb/server/domain/workloads";
import { subscribeUserEvents } from "@orb/server/transport/trpc";
import { afterEach, beforeEach, describe, vi } from "vitest";
import type { PortabilityRunnerComposeDeps } from "../../../../packages/server/src/entry/compose/portability-runner.ts";
import {
  buildPortabilityRunner,
  createEnqueueImportIndex,
  createSettleImportMemory,
} from "../../../../packages/server/src/entry/compose/portability-runner.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_runner_owner");
const OTHER = castId<UserId>("usr_runner_other");

// @orb-waive no-test-fabrication(unknown): never dereferenced — nothing this pin drives reaches a query. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

let stagedRoot: string;

function build(overrides: Partial<PortabilityRunnerComposeDeps> = {}): ReturnType<typeof buildPortabilityRunner> {
  // @orb-waive no-test-fabrication(unknown): inert structural stand-ins for the nine domain contexts/front doors this seam threads. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    tagCtx: {},
    settingsCtx: {},
    presetCtx: {},
    worldInfoExportCtx: {},
    importStandaloneLorebook: vi.fn(),
    galleryCtx: {},
    databankCtx: {},
    persona: { list: vi.fn(), export: vi.fn(), import: vi.fn() },
    exportService: { exportCharacter: vi.fn(), exportChatBundle: vi.fn(), listHostChats: vi.fn() },
    character: {
      listEmbeddableCharacterIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findByImportHash: vi.fn(),
      attachImportedArt: vi.fn(),
      findByHandle: vi.fn(),
    },
    assets: { store: vi.fn() },
    attachCardTag: vi.fn(),
    attachChatTag: vi.fn(),
    importRpgGame: vi.fn(),
    importWorldInfo: { importLorebook: vi.fn(), linkCarriedBooks: vi.fn() },
    importCardScripts: vi.fn(),
    exportRegexScripts: vi.fn(),
    importRegexScript: vi.fn(),
    importPresetScripts: vi.fn(),
    importGlobalScripts: vi.fn(),
    attachBooksByName: vi.fn(),
    bulkImportChats: vi.fn(),
    bulkImportPersonas: vi.fn(),
    resolveOwnerPrincipal: vi.fn(() => Promise.resolve(principal(OWNER))),
    workloads: { start: vi.fn(() => Promise.resolve({ id: "wl_1" })) },
    ...overrides,
  } as unknown as PortabilityRunnerComposeDeps;
  return buildPortabilityRunner(deps);
}

/** Read the first `n` events off ONE live user-bus iterator (`on()` buffers from subscribe). Taking them
 *  from a single iterator matters: `for await … return` CLOSES the iterator, so two separate reads would
 *  lose whatever the first one closed over. */
async function take(stream: AsyncIterable<UserBusEvent>, n: number): Promise<UserBusEvent[]> {
  const out: UserBusEvent[] = [];
  for await (const event of stream) {
    out.push(event);
    if (out.length === n) {
      return out;
    }
  }
  throw new Error(`stream ended after ${out.length} of ${n} events`);
}

beforeEach(async () => {
  stagedRoot = await mkdtemp(join(tmpdir(), "orb-runner-test-"));
});

afterEach(async () => {
  await rm(stagedRoot, { recursive: true, force: true });
});

describe("buildPortabilityRunner — the staging root must agree with what the upload routes wrote", () => {
  test("absent ⇒ the app-owned default — byte-identical to `entry/http/import.ts`'s own default", () => {
    expect(build().importWorkloads.stagingRoot).toBe(DEFAULT_IMPORT_STAGING_DIR);
    // Never the OS temp dir: a shared, world-listable namespace is not a staging root (#1534).
    expect(build().importWorkloads.stagingRoot).not.toBe(tmpdir());
  });

  test("supplied ⇒ that exact root (the fence staged handles must resolve strictly inside)", () => {
    expect(build({ importStagingDir: stagedRoot }).importWorkloads.stagingRoot).toBe(stagedRoot);
  });

  test("the ST profile default is the gitignored repo-root snapshot, never the cwd or a temp dir", () => {
    expect(build().importWorkloads.stProfileDir).toBe(".st-data");
    expect(build({ stProfileDir: "/srv/st" }).importWorkloads.stProfileDir).toBe("/srv/st");
  });
});

describe("buildPortabilityRunner — quiet mode wraps the bulk runs without swallowing their counts", () => {
  test("a staged-dir import over an EMPTY tree still returns real counts through the quiet scope", async () => {
    const { importWorkloads } = build({ importStagingDir: stagedRoot });

    const counts = await importWorkloads.runStagedDirImport({ stagedPath: stagedRoot, ownerId: OWNER, signal: new AbortController().signal });

    // 0/0/0 here is the HONEST answer for an empty tree — the point is that a value came back at all
    // (a `withQuietBulkFanout` that dropped the return would surface `undefined`).
    expect(counts).toStrictEqual({ imported: 0, skipped: 0, failed: 0, notes: [], memoryScope: null });
  });

  // #1710 — through the WORKLOAD door (`runStagedDirImport`, not the verb directly): a card whose character
  // already holds a primary book skips the embedded-book re-assert (#1598) and the character descriptor
  // records that as a note (#1688). Before #1710 the runner's own collapse to `{imported,skipped,failed}`
  // dropped it before it ever reached a background `import-bundle` workload's result.
  test("a real staged card whose primary book is taken surfaces the #1598 kept-book note on the workload result", async () => {
    const cardJson =
      '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Aria","description":"a bard","character_book":{"name":"Aria\'s World","entries":[{"keys":["kingdom"],"content":"A realm of dusk.","comment":"The Kingdom","insertion_order":10}]}}}';
    await mkdir(join(stagedRoot, "characters"), { recursive: true });
    await writeFile(join(stagedRoot, "characters", "Aria.json"), cardJson);
    const characterId = castId<CharacterId>("chr_aria");
    const { importWorkloads } = build({
      importStagingDir: stagedRoot,
      // @orb-waive no-test-fabrication(unknown): only the four ops `buildOwnerImport` reads off `deps.character` matter here — the Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      // rest of the real `CharacterService` surface is never touched by a staged card import.
      character: {
        listEmbeddableCharacterIds: vi.fn(),
        create: vi.fn(() => Promise.resolve({ id: characterId })),
        update: vi.fn(),
        findByImportHash: vi.fn(() => Promise.resolve(null)),
        findByHandle: vi.fn(() => Promise.resolve(null)),
      } as unknown as CharacterService,
      importWorldInfo: { importLorebook: vi.fn(), linkCarriedBooks: vi.fn(), hasPrimaryBook: vi.fn(() => Promise.resolve(true)) },
    });

    const counts = await importWorkloads.runStagedDirImport({ stagedPath: stagedRoot, ownerId: OWNER, signal: new AbortController().signal });

    expect(counts.imported).toBe(1);
    expect(counts.notes).toHaveLength(1);
    expect(counts.notes[0]).toContain("was NOT re-asserted");
  });
});

describe("buildPortabilityRunner — the terminal library fan (#23) reaches ONLY the target owner", () => {
  test("emits BOTH `charactersChanged` and a chat-list refresh onto the owner's channel", async () => {
    const { importWorkloads } = build();
    const abort = new AbortController();
    const stream = subscribeUserEvents(OWNER, abort.signal);

    importWorkloads.emitLibraryChanged({ ownerId: OWNER });

    const [first, second] = await take(stream, 2);
    expect(first).toStrictEqual({ type: "charactersChanged" });
    // `chatsChanged` with no chatId drives BOTH the chat list and character.list in the client's bus map.
    expect(second).toMatchObject({ type: "chatsChanged" });
    abort.abort();
  });

  test("another owner's channel receives NOTHING (a bulk import is one account's event)", async () => {
    const { importWorkloads } = build();
    const abortOther = new AbortController();
    const otherStream = subscribeUserEvents(OTHER, abortOther.signal);

    importWorkloads.emitLibraryChanged({ ownerId: OWNER });
    // Then a marker onto OTHER's own channel: if the owner's fan had leaked, OTHER's FIRST yield would be
    // `charactersChanged` instead of this marker.
    const marker: UserBusEvent = { type: "settingsChanged" };
    const { publishUserEvent } = await import("@orb/server/transport/trpc");
    publishUserEvent(OTHER, marker);

    expect(await take(otherStream, 1)).toStrictEqual([marker]);
    abortOther.abort();
  });
});

// ── AN IMPORT ENQUEUES NOTHING PAID ─────────────────────────────────────────────────────────────────────
// `memory-backfill` spends the Utility model on every imported chat, and a paid run starts only behind the
// model-run confirm. The import's own enqueues are free: the text `index` pass, and the segments-only memory pass
// over the import's span (`createSettleImportMemory`); the digest build is the client's offer over that span.
describe("createEnqueueImportIndex — the post-import enqueue is the free index pass alone", () => {
  /** A workloads door that answers like the real one: the single-active unique index refuses a second
   *  enqueue of the same unit, UNLESS the caller asks to adopt the run already holding the slot. */
  function fakeWorkloads(activeIndexId: WorkloadId | null): {
    readonly calls: StartWorkloadParams[];
    readonly workloads: Pick<WorkloadService, "start">;
  } {
    const calls: StartWorkloadParams[] = [];
    return {
      calls,
      workloads: {
        start: (params: StartWorkloadParams): Promise<WorkloadRef> => {
          calls.push(params);
          if (params.input.kind === "index" && activeIndexId !== null) {
            if (params.adoptActive !== true) {
              return Promise.reject(new DomainConflictError('That "index" run is already in progress'));
            }
            return Promise.resolve({ id: activeIndexId });
          }
          return Promise.resolve({ id: castId<WorkloadId>("wl_minted") });
        },
      },
    };
  }

  test("the only row an import enqueues is the owner's text index pass — never a memory-backfill", async () => {
    const door = fakeWorkloads(null);
    await createEnqueueImportIndex(door.workloads)({ ownerId: OWNER });

    expect(door.calls.map((call) => ({ input: call.input, ownerId: call.ownerId }))).toStrictEqual([
      { input: { kind: "index", params: { source: "text" } }, ownerId: OWNER },
    ]);
  });

  test("an index pass already running is adopted, so the import does not fail on the conflict", async () => {
    const door = fakeWorkloads(castId<WorkloadId>("wl_already_running"));

    await expect(createEnqueueImportIndex(door.workloads)({ ownerId: OWNER })).resolves.toBeUndefined();
    expect(door.calls.map((call) => call.adoptActive)).toStrictEqual([true]);
  });
});

describe("createSettleImportMemory — an import's span, and its free segment pass", () => {
  const From = 1000;
  const To = 1900;
  const chatId = mintTypeId(ID_PREFIX.chat);

  function recordingDoor(answer: (params: StartWorkloadParams) => Promise<WorkloadRef>): {
    readonly calls: StartWorkloadParams[];
    readonly workloads: Pick<WorkloadService, "start">;
  } {
    const calls: StartWorkloadParams[] = [];
    return {
      calls,
      workloads: {
        start: (params: StartWorkloadParams): Promise<WorkloadRef> => {
          calls.push(params);
          return answer(params);
        },
      },
    };
  }

  test("an import that wrote real conversations returns its span and enqueues ONLY the segments-only pass over it", async () => {
    const door = recordingDoor(() => Promise.resolve({ id: castId<WorkloadId>("wl_segments") }));

    const scope = await createSettleImportMemory(door.workloads, () => To)({ ownerId: OWNER, from: From, memoryChatIds: [chatId] });

    expect(scope).toStrictEqual({ from: From, to: To });
    expect(door.calls.map((call) => ({ input: call.input, ownerId: call.ownerId, adoptActive: call.adoptActive }))).toStrictEqual([
      { input: { kind: "memory-backfill", params: { importWindow: { from: From, to: To }, segmentsOnly: true } }, ownerId: OWNER, adoptActive: true },
    ]);
  });

  test("an import that wrote no real conversation has no scope and enqueues nothing", async () => {
    const door = recordingDoor(() => Promise.resolve({ id: castId<WorkloadId>("wl_unused") }));

    await expect(createSettleImportMemory(door.workloads, () => To)({ ownerId: OWNER, from: From, memoryChatIds: [] })).resolves.toBeNull();
    expect(door.calls).toEqual([]);
  });

  test("a memory-off owner's refusal is not an import failure: the span still returns for the client to judge", async () => {
    const door = recordingDoor(() => Promise.reject(new DomainOperationError(WORKLOAD_NOT_ADMISSIBLE, "Memory is turned off")));

    await expect(createSettleImportMemory(door.workloads, () => To)({ ownerId: OWNER, from: From, memoryChatIds: [chatId] })).resolves.toStrictEqual({
      from: From,
      to: To,
    });
  });
});

describe("buildPortabilityRunner — the registry and the workload bundle are both produced", () => {
  test("the portability registry is composed here (twelve descriptors, the shared import slice)", () => {
    const { portability } = build();

    expect(portability).toHaveLength(12);
    expect(portability.map((e) => e.kind)).toContain("character");
  });

  test("the workload bundle carries every op the import contributions need", () => {
    const { importWorkloads } = build();

    for (const key of [
      "stagingRoot",
      "stProfileDir",
      "listTokenUsageCandidates",
      "compareAndSetTokenUsage",
      "runProfileDirImport",
      "runBundleImport",
      "runStagedDirImport",
      "reconcileImportStats",
      "emitLibraryChanged",
    ]) {
      expect(Object.hasOwn(importWorkloads, key)).toBe(true);
    }
  });
});
