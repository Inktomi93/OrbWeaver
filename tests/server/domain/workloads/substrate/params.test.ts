// substrate/params — the kind-indexed params helpers the verbs + read path share. Pure (a fake single-kind
// WorkloadContributions registry over the REAL databank-ingest params schema). Pins: envelope + per-kind
// schema validation collapses a bad blob to a typed domain error (never an escaping ZodError), the
// admission-key default bucket vs a declared one, and the admit() precondition's refusal shape.

import { databankIngestWorkloadParams } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { DocumentId, UserId } from "@orb/kit/ids";
import { castId, mintTypeId } from "@orb/kit/ids";
import type { WorkloadContribution, WorkloadContributions } from "@orb/server/domain/workloads";
import { describe } from "vitest";
import {
  activeConflictMessage,
  assertAdmissible,
  parseWorkloadInput,
  resolveAdmissionKey,
} from "../../../../../packages/server/src/domain/workloads/substrate/params.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER: UserId = castId("user_owner");
const DOC_ID: DocumentId = mintTypeId("document");

/** A minimal single-kind contribution registry — only `params`/`admissionKey`/`admit` are read by this
 *  file's substrate helpers; `run`/`resume` are never invoked here. */
function contributionsWith(over: Partial<WorkloadContribution<"databank-ingest">>): WorkloadContributions {
  const base: WorkloadContribution<"databank-ingest"> = {
    kind: "databank-ingest",
    params: databankIngestWorkloadParams,
    lane: "sweep",
    resume: "none",
    // unused by this file's assertions — the substrate helpers under test never call `run`.
    run: () => Promise.reject(new Error("not invoked by this test")),
    ...over,
  };
  // @orb-waive no-test-fabrication(WorkloadContributions): a minimal single-kind registry double — only the "databank-ingest" contribution this file's tests exercise. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { "databank-ingest": base } as WorkloadContributions;
}

describe("parseWorkloadInput", () => {
  test("a valid envelope + params parses through to the typed input", () => {
    const contributions = contributionsWith({});
    const out = parseWorkloadInput(contributions, { kind: "databank-ingest", params: { documentId: DOC_ID } });
    expect(out).toEqual({ kind: "databank-ingest", params: { documentId: DOC_ID } });
  });

  test("a params blob that fails the OWNING domain's schema surfaces as a typed invalid_params domain error, never a raw ZodError", () => {
    const bad = { kind: "databank-ingest" as const, params: { documentId: castId<DocumentId>("not-a-typeid") } };
    let thrown: unknown;
    try {
      parseWorkloadInput(contributionsWith({}), bad);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainOperationError);
    expect((thrown as DomainOperationError).code).toBe("invalid_params");
    expect((thrown as Error).cause).toBeDefined();
  });
});

describe("resolveAdmissionKey", () => {
  test("a kind that declares no admissionKey shares the DEFAULT bucket", () => {
    const contributions = contributionsWith({});
    expect(resolveAdmissionKey(contributions, "databank-ingest", { documentId: DOC_ID })).toBe("none");
  });

  test("a kind that declares one derives its own partition from params — ONE document ingests at once", () => {
    const contributions = contributionsWith({ admissionKey: (params) => params.documentId });
    expect(resolveAdmissionKey(contributions, "databank-ingest", { documentId: DOC_ID })).toBe(DOC_ID);
  });
});

describe("assertAdmissible", () => {
  test("a kind with no admit() precondition is always admissible", async () => {
    const contributions = contributionsWith({});
    await expect(assertAdmissible(contributions, "databank-ingest", { documentId: DOC_ID }, OWNER)).resolves.toBeUndefined();
  });

  test("a refusal throws a typed domain error carrying the domain's own sentence", async () => {
    const contributions = contributionsWith({ admit: () => Promise.resolve("that document no longer exists") });
    await expect(assertAdmissible(contributions, "databank-ingest", { documentId: DOC_ID }, OWNER)).rejects.toMatchObject({
      message: expect.stringContaining("that document no longer exists"),
    });
  });

  test("a null refusal (explicit pass) is admissible", async () => {
    const contributions = contributionsWith({ admit: () => Promise.resolve(null) });
    await expect(assertAdmissible(contributions, "databank-ingest", { documentId: DOC_ID }, OWNER)).resolves.toBeUndefined();
  });
});

test("activeConflictMessage names the kind AND both remedies (wait / cancel) — the client's only render source", () => {
  const message = activeConflictMessage("databank-ingest");
  expect(message).toContain("databank-ingest");
  expect(message).toMatch(/wait/i);
  expect(message).toMatch(/cancel/i);
});
