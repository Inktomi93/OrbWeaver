// entry/boot/seed-cas-schedules — the CAS maintenance cadence seed (#11). Pins the boot step's branching with
// the workloads schedule verbs stubbed (the row mechanics are tested in domain/workloads — this isolates the
// boot wiring, the seed-credential seam-test precedent). Covers: a fresh box gets both ratified schedules with
// the ratified cadences and the FORCED bulk mode; a box that already has them adds nothing; a partially-seeded
// box fills only the gap; and an owner's retuned cadence / disabled row is left untouched (the idempotency
// claim the header makes — matching on KIND, never on the (kind, cadence) pair).

import type { ScheduleCadence, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import type { UserId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadScheduleRow } from "@orb/server/domain/workloads";
import { seedCasSchedules } from "@orb/server/entry/boot";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("u_owner");

interface CreatedSchedule {
  readonly kind: WorkloadKind;
  readonly cadence: ScheduleCadence;
  readonly mode: WorkloadMode;
  readonly ownerId: UserId | null;
}

/** A fully-typed schedule row — a factory, not a cast, so a new NOT NULL column breaks this file loudly. */
function makeRow(overrides: Partial<WorkloadScheduleRow> & { kind: WorkloadKind }): WorkloadScheduleRow {
  return {
    id: castId<WorkloadScheduleId>(`workload_schedule_${overrides.kind}`),
    ownerId: OWNER,
    mode: "bulk",
    params: {},
    cadence: "weekly",
    nextRunAt: 0,
    lastRunAt: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

interface CreateArgs {
  readonly input: { readonly kind: WorkloadKind };
  readonly cadence: ScheduleCadence;
  readonly mode: WorkloadMode;
  readonly ownerId: UserId | null;
}

interface FakeWorkloads {
  readonly created: CreatedSchedule[];
  readonly workloads: {
    readonly listSchedules: () => Promise<readonly WorkloadScheduleRow[]>;
    readonly createSchedule: (params: CreateArgs) => Promise<{ id: WorkloadScheduleId }>;
  };
}

/** The two schedule verbs the step uses, recording what it created. */
function fakeWorkloads(existing: readonly WorkloadScheduleRow[]): FakeWorkloads {
  const created: CreatedSchedule[] = [];
  return {
    created,
    workloads: {
      listSchedules: async (): Promise<readonly WorkloadScheduleRow[]> => await Promise.resolve(existing),
      createSchedule: async (params: CreateArgs): Promise<{ id: WorkloadScheduleId }> => {
        created.push({ kind: params.input.kind, cadence: params.cadence, mode: params.mode, ownerId: params.ownerId });
        return await Promise.resolve({ id: castId<WorkloadScheduleId>(`workload_schedule_new_${params.input.kind}`) });
      },
    },
  };
}

describe("seedCasSchedules — the ratified CAS maintenance cadence", () => {
  test("a fresh box gets GC weekly + fsck monthly, both bulk, stamped with the owner", async () => {
    const { created, workloads } = fakeWorkloads([]);
    await seedCasSchedules({ workloads, ownerId: OWNER });

    expect(created).toHaveLength(2);
    expect(created).toEqual(
      expect.arrayContaining([
        { kind: "assets-gc", cadence: "weekly", mode: "bulk", ownerId: OWNER },
        { kind: "assets-fsck", cadence: "monthly", mode: "bulk", ownerId: OWNER },
      ]),
    );
  });

  test("idempotent — a second boot with both rows present creates nothing", async () => {
    const { created, workloads } = fakeWorkloads([makeRow({ kind: "assets-gc" }), makeRow({ kind: "assets-fsck", cadence: "monthly" })]);
    await seedCasSchedules({ workloads, ownerId: OWNER });

    expect(created).toEqual([]);
  });

  test("fills ONLY the missing kind on a partially-seeded box", async () => {
    const { created, workloads } = fakeWorkloads([makeRow({ kind: "assets-gc" })]);
    await seedCasSchedules({ workloads, ownerId: OWNER });

    expect(created).toEqual([{ kind: "assets-fsck", cadence: "monthly", mode: "bulk", ownerId: OWNER }]);
  });

  // The claim the header makes: an owner's edits survive. A retuned cadence and a deliberately disabled row
  // both still COUNT as present — restoring a default beside either would be the clobber this gate prevents.
  test("leaves an owner's retuned cadence and a disabled row alone", async () => {
    const { created, workloads } = fakeWorkloads([
      makeRow({ kind: "assets-gc", cadence: "daily" }),
      makeRow({ kind: "assets-fsck", cadence: "weekly", enabled: false }),
    ]);
    await seedCasSchedules({ workloads, ownerId: OWNER });

    expect(created).toEqual([]);
  });
});
