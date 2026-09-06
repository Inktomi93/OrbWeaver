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
import type { Db } from "@orb/db";
import { DomainConflictError } from "@orb/kit/errors";
import type { CharacterId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterService } from "@orb/server/domain/character";
import { DEFAULT_IMPORT_STAGING_DIR } from "@orb/server/domain/import";
import type { StartWorkloadParams, WorkloadService } from "@orb/server/domain/workloads";
import { subscribeUserEvents } from "@orb/server/transport/trpc";
import { afterEach, beforeEach, describe, vi } from "vitest";
import type { PortabilityRunnerComposeDeps } from "../../../../packages/server/src/entry/compose/portability-runner.ts";
import { buildPortabilityRunner, createEnqueueImportBackfill } from "../../../../packages/server/src/entry/compose/portability-runner.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_runner_owner");
const OTHER = castId<UserId>("usr_runner_other");

// FABRICATION-OK: never dereferenced — nothing this pin drives reaches a query.
const NO_DB = {} as unknown as Db;

let stagedRoot: string;

function build(overrides: Partial<PortabilityRunnerComposeDeps> = {}): ReturnType<typeof buildPortabilityRunner> {
  // FABRICATION-OK: inert structural stand-ins for the nine domain contexts/front doors this seam threads.
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
    character: { listEmbeddableCharacterIds: vi.fn(), create: vi.fn(), update: vi.fn(), findByImportHash: vi.fn(), findByHandle: vi.fn() },
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
    expect(counts).toStrictEqual({ imported: 0, skipped: 0, failed: 0, notes: [] });
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
      // FABRICATION-OK: only the four ops `buildOwnerImport` reads off `deps.character` matter here — the
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

// ── THE POST-IMPORT EMBED DAG SURVIVES AN ADMISSION CONFLICT ──────────────────────────────────────────────
// The chain is `index` (embed the characters) → `memory-backfill` (embed the chats), and the second must
// WAIT for the first: they compete for the same embed engine and the memory pass searches what the index
// pass wrote. The conflict path used to break exactly that edge — `startEmbed` swallowed the single-active
// `DomainConflictError` and returned `undefined`, the caller spread `dependsOn` only when a WorkloadId came
// back, so a conflict silently enqueued the memory pass as an INDEPENDENT root that could run first.
describe("createEnqueueImportBackfill — the dependency edge, including on the conflict path", () => {
  /** A workloads door that answers like the real one: the single-active unique index refuses a second
   *  enqueue of the same unit, UNLESS the caller asks to adopt the run already holding the slot. */
  function fakeWorkloads(activeIndexId: WorkloadId | null): {
    readonly calls: StartWorkloadParams[];
    readonly workloads: Pick<WorkloadService, "start">;
  } {
    const calls: StartWorkloadParams[] = [];
    let minted = 0;
    return {
      calls,
      workloads: {
        start: (params: StartWorkloadParams): Promise<{ id: WorkloadId }> => {
          calls.push(params);
          if (params.input.kind === "index" && activeIndexId !== null) {
            if (params.adoptActive !== true) {
              return Promise.reject(new DomainConflictError('That "index" run is already in progress'));
            }
            return Promise.resolve({ id: activeIndexId });
          }
          minted += 1;
          return Promise.resolve({ id: castId<WorkloadId>(`wl_minted_${String(minted)}`) });
        },
      },
    };
  }

  test("with no conflict the memory pass depends on the index pass this call created", async () => {
    const door = fakeWorkloads(null);
    expect(await createEnqueueImportBackfill(door.workloads)({ ownerId: OWNER })).toBe(true);

    const memory = door.calls.find((c) => c.input.kind === "memory-backfill");
    expect(memory?.dependsOn).toStrictEqual(["wl_minted_1"]);
  });

  test("an index-pass CONFLICT still yields a memory pass carrying the ACTIVE run as its dependency", async () => {
    const active = castId<WorkloadId>("wl_already_running");
    const door = fakeWorkloads(active);

    expect(await createEnqueueImportBackfill(door.workloads)({ ownerId: OWNER })).toBe(true);

    const memory = door.calls.find((c) => c.input.kind === "memory-backfill");
    // The edge is the whole point: a memory pass with no dependency races the index pass it must follow.
    expect(memory?.dependsOn).toStrictEqual([active]);
  });

  // ── THE TWO PASSES ASK DIFFERENT QUESTIONS, SO ONLY ONE OF THEM ADOPTS ────────────────────────────────
  // The INDEX pass is a DEPENDENCY TARGET: any active run of the same admission unit is exactly the thing
  // to wait on, so adopting it is the right answer and the edge survives. The MEMORY pass is a COVERAGE
  // CLAIM — this function's boolean is what the import report renders as "the memory pass entered the
  // queue for this import" — and an ADOPTED memory run was admitted under someone else's `dependsOn`
  // (`workloads/contract/params.ts`: an adopted row necessarily drops the caller's). It carries no edge to
  // this import's index pass and may already be past the rows we just wrote, so reporting `true` for it
  // would make the report claim a coverage it cannot have. It reports `false`, exactly as the pre-adopt
  // code did — the same arm the #156 memory-off refusal already lands on.
  test("a MEMORY-pass conflict reports false — an adopted memory run is not coverage for THIS import", async () => {
    const activeMemory = castId<WorkloadId>("wl_someone_elses_memory_run");
    const calls: StartWorkloadParams[] = [];
    // FAITHFUL to the real door on BOTH arms: a caller that asks to adopt GETS the active run's id (which is
    // precisely how reporting `true` for it became possible), and one that does not gets the conflict.
    const door: Pick<WorkloadService, "start"> = {
      start: (params: StartWorkloadParams): Promise<{ id: WorkloadId }> => {
        calls.push(params);
        if (params.input.kind !== "memory-backfill") {
          return Promise.resolve({ id: castId<WorkloadId>("wl_index") });
        }
        if (params.adoptActive === true) {
          return Promise.resolve({ id: activeMemory });
        }
        return Promise.reject(new DomainConflictError('That "memory-backfill" run is already in progress'));
      },
    };

    expect(await createEnqueueImportBackfill(door)({ ownerId: OWNER })).toBe(false);

    // …and it never asked to adopt one: the request that would have produced an edgeless memory row was
    // never made, so there is no `dependsOn`-less memory workload anywhere for a reader to trust.
    const memory = calls.find((c) => c.input.kind === "memory-backfill");
    expect(memory?.adoptActive).toBeUndefined();
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
