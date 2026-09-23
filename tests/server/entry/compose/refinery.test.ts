// entry/compose/refinery — the seam that assembles the refinery domain's TWO halves side by side: the
// principal-taking SERVICE (tRPC) and the principal-LESS workload deps the `refine-score-sweep` library pass
// closes over. The whole point of the file is that those two bundles are DIFFERENT, and the difference is a
// security property, not a tidiness one: the queue's own actor gets no session minters, no apply-path
// character ops and no clock — so a sweep that grew a write path would have to come back through this seam
// and be seen, instead of quietly inheriting the service's authority (the principal-less-ops rule).
//
// The other two pins are the ones a compose seam gets wrong silently:
//   • `roleClientsFor` is threaded VERBATIM (never wrapped, memoized or read at compose time — the getter
//     collapse, §7.5-1b: the six per-role getters, including the old `summarizerContextTokens` thunk, folded
//     into ONE `resolved(task)` read), so a role re-point takes effect on the very next call.
//   • the per-user prose resolver is CALLER-SCOPED — it reads the settings of the userId it is handed, and
//     it is the SAME function object in both halves (one home for the resolution).

import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import type { RefineryComposeDeps } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { buildRefinery } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { expect, test } from "../../../support/fixtures.ts";

const USER = castId<UserId>("usr_author");
const OTHER = castId<UserId>("usr_other");

// @orb-waive no-test-fabrication(unknown): never dereferenced — the seam only threads `db` into the factories it builds. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

/** The EXACT dep set the workload half is allowed to close over (R4). */
const WORKLOAD_KEYS = [
  "roleClientsFor",
  "resolveUserPresetParams",
  "resolveUserProse",
  "listRefineryScoreTargets",
  "stampRefinerySignals",
  "emitUserEvent",
] as const;

interface Harness {
  readonly deps: RefineryComposeDeps;
  readonly roleClientsFor: ReturnType<typeof vi.fn>;
  readonly loadUserSettings: ReturnType<typeof vi.fn>;
  readonly resolveUserPresetParams: ReturnType<typeof vi.fn>;
}

function harness(prose: UserSettings["prose"] = {}): Harness {
  const roleClientsFor = vi.fn<RefineryComposeDeps["roleClientsFor"]>();
  const loadUserSettings = vi.fn((userId: UserId) => Promise.resolve({ prose: userId === USER ? prose : {} }));
  const resolveUserPresetParams = vi.fn(() => Promise.resolve({}));
  // @orb-waive no-test-fabrication(unknown): the seam stores the character front door and the db and calls neither here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    roleClientsFor,
    character: { snapshot: vi.fn(), update: vi.fn(), get: vi.fn(), duplicate: vi.fn() },
    resolveUserPresetParams,
    loadUserSettings,
  } as unknown as RefineryComposeDeps;
  return { deps, roleClientsFor, loadUserSettings, resolveUserPresetParams };
}

describe("buildRefinery — the queue's actor gets a SMALLER bundle than the service", () => {
  test("the workload half closes over exactly the six library-pass deps — no minters, no clock, no apply ops", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);

    expect(Object.keys(refineryWorkloads).sort()).toStrictEqual([...WORKLOAD_KEYS].sort());
  });

  test("neither the apply-path character verbs nor an id minter leak into the workload bundle", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);
    const keys = Object.keys(refineryWorkloads);

    for (const forbidden of ["snapshotCharacter", "updateCharacter", "duplicateCharacter", "getCharacter", "newRefinerySessionId", "now"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test("both halves are returned (the service is composed, not replaced by the workload bundle)", () => {
    const built = buildRefinery(harness().deps);

    expect(typeof built.refinery.startSession).toBe("function");
    expect(typeof built.refineryWorkloads.listRefineryScoreTargets).toBe("function");
  });
});

describe("buildRefinery — the summarizer binding stays LIVE (a role re-point must reach the sweep)", () => {
  test("roleClientsFor is threaded verbatim into the workload bundle — a role re-point reaches the sweep on the very next call", () => {
    const roleClientsFor = vi.fn<RefineryComposeDeps["roleClientsFor"]>();
    // @orb-waive no-test-fabrication(unknown): the seam stores the character front door and the db and calls neither here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const deps = {
      db: NO_DB,
      now: () => 1000,
      roleClientsFor,
      character: { snapshot: vi.fn(), update: vi.fn(), get: vi.fn(), duplicate: vi.fn() },
      resolveUserPresetParams: vi.fn(() => Promise.resolve({})),
      loadUserSettings: vi.fn(() => Promise.resolve({ prose: {} })),
    } as unknown as RefineryComposeDeps;

    const { refineryWorkloads } = buildRefinery(deps);

    // The compose seam threads the SAME function object through — never wrapped, memoized or read at
    // compose time — so a later role re-point (a new `roleClientsFor` binding replacing this reference
    // upstream) governs the sweep's very next call, exactly like the service half (role-clients.ts: "a
    // re-pointed binding governs the very next call, no restart, no invalidation hook to forget").
    expect(refineryWorkloads.roleClientsFor).toBe(roleClientsFor);
  });
});

describe("buildRefinery — the prose resolver is caller-scoped and single-homed", () => {
  test("it reads the settings of the userId it is handed, and returns that user's prose overrides", async () => {
    // @orb-waive no-test-fabrication(UserSettings["prose"]): a hand-shaped prose OVERRIDE map — the point is an arbitrary authored slot, which is Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // exactly what an override is; the resolver must return it verbatim for its own user and nothing for another.
    const authored = { "some.slot": "authored" } as UserSettings["prose"];
    const h = harness(authored);
    const { refineryWorkloads } = buildRefinery(h.deps);

    expect(await refineryWorkloads.resolveUserProse(USER)).toStrictEqual({ "some.slot": "authored" });
    expect(await refineryWorkloads.resolveUserProse(OTHER)).toStrictEqual({});
    expect(h.loadUserSettings.mock.calls.map((c) => c[0])).toStrictEqual([USER, OTHER]);
  });

  test("the caller's preset params op is threaded verbatim (the distill rung reads the CARD OWNER's)", () => {
    const h = harness();
    const { refineryWorkloads } = buildRefinery(h.deps);

    expect(refineryWorkloads.resolveUserPresetParams).toBe(h.resolveUserPresetParams);
  });
});

describe("buildRefinery — the freshness plane is the house injected emit, not a transport reach", () => {
  test("the workload half emits through `publishUserEvent` (the domain never imports transport)", () => {
    const { refineryWorkloads } = buildRefinery(harness().deps);

    expect(refineryWorkloads.emitUserEvent).toBe(publishUserEvent);
  });
});
