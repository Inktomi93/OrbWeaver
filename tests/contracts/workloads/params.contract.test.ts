// Contract test: the per-kind workload params schemas + the `start` wire envelope. Pins the parse seam
// (tunables OPTIONAL, required fields required, the staging-handle traversal belt) and the envelope's
// deliberate widening — it validates `kind` + "params is an object" only, because the AUTHORITATIVE per-kind
// validator is the owning domain's `WorkloadContribution.params` at the `start` door.

import {
  databankIngestWorkloadParams,
  databankReindexWorkloadParams,
  emptyWorkloadParams,
  importBundleWorkloadParams,
  importStWorkloadParams,
  indexWorkloadParams,
  maintenanceWorkloadParams,
  startWorkloadEnvelope,
} from "@orb/contracts/workloads";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("workload params schemas", () => {
  test("a tunable-less kind accepts an empty params object", () => {
    expect(emptyWorkloadParams.parse({})).toEqual({});
  });

  test("index requires a source and accepts an optional force flag", () => {
    expect(indexWorkloadParams.parse({ source: "text" })).toEqual({ source: "text" });
    expect(indexWorkloadParams.parse({ source: "all", force: true })).toEqual({ source: "all", force: true });
    // `source` is REQUIRED (it selects the pass AND stamps the single-active lock).
    expect(() => indexWorkloadParams.parse({})).toThrow();
    expect(() => indexWorkloadParams.parse({ source: "corpus" })).toThrow();
  });

  test("the maintenance shape accepts an optional dryRun", () => {
    expect(maintenanceWorkloadParams.parse({})).toEqual({});
    expect(maintenanceWorkloadParams.parse({ dryRun: true })).toEqual({ dryRun: true });
  });

  test("databank-ingest requires a branded documentId; databank-reindex requires a scope", () => {
    expect(() => databankIngestWorkloadParams.parse({})).toThrow();
    expect(() => databankIngestWorkloadParams.parse({ documentId: "not-a-typeid" })).toThrow();
    expect(databankReindexWorkloadParams.parse({ scope: { kind: "owner" } })).toEqual({ scope: { kind: "owner" } });
    expect(() => databankReindexWorkloadParams.parse({})).toThrow();
  });

  test("import-bundle requires the staging token (the route mints it; empty/missing is rejected)", () => {
    expect(importBundleWorkloadParams.parse({ token: "import-bundle-abc.zip" })).toEqual({ token: "import-bundle-abc.zip" });
    expect(() => importBundleWorkloadParams.parse({})).toThrow();
    expect(() => importBundleWorkloadParams.parse({ token: "" })).toThrow();
  });

  // The staging handle is a SINGLE server-minted path segment (`import-tree-<uuid>` / `import-bundle-<uuid>.zip`).
  // The outer belt: a tRPC-crafted traversal shape MUST fail at the contract layer, before the import
  // contribution ever resolves it. A directory-delete escape (`stagedDir: ".."`) was reachable by any authed
  // user via `workloads.start` (import-st/import-bundle are singular, so no requireOwner gate) — this schema
  // makes the hostile shapes unrepresentable.
  const traversalHandles = [
    "..", // parent — the arbitrary-delete escape
    ".", // the staging root itself
    "/etc", // absolute
    "../foo", // relative escape
    "a/b", // forward separator
    "a\\b", // backslash separator (Windows-style)
    "a\0b", // NUL byte
    ".hidden", // leading dot (the regex anchors on an alphanumeric first char)
    "foo..bar", // an embedded `..` (belt-and-suspenders — never in a real token)
    "", // empty
  ] as const;

  test("import-st rejects every path-traversal stagedDir at the contract layer", () => {
    expect(importStWorkloadParams.parse({ stagedDir: "import-tree-550e8400-e29b-41d4-a716-446655440000" })).toEqual({
      stagedDir: "import-tree-550e8400-e29b-41d4-a716-446655440000",
    });
    // stagedDir is OPTIONAL — omitting it is valid (⇒ the env-configured profile dir).
    expect(importStWorkloadParams.parse({})).toEqual({});
    for (const stagedDir of traversalHandles) {
      expect(() => importStWorkloadParams.parse({ stagedDir })).toThrow();
    }
  });

  test("import-bundle rejects every path-traversal token at the contract layer", () => {
    expect(importBundleWorkloadParams.parse({ token: "import-bundle-550e8400-e29b-41d4-a716-446655440000.zip" })).toEqual({
      token: "import-bundle-550e8400-e29b-41d4-a716-446655440000.zip",
    });
    for (const token of traversalHandles) {
      expect(() => importBundleWorkloadParams.parse({ token })).toThrow();
    }
  });
});

describe("startWorkloadEnvelope (the wire envelope)", () => {
  test("accepts a known kind with an object params blob", () => {
    const parsed = startWorkloadEnvelope.parse({ kind: "compute-themes", params: { k: 5 } });
    expect(parsed.kind).toBe("compute-themes");
    expect(parsed.params).toEqual({ k: 5 });
  });

  test("rejects an unknown kind and a non-object params", () => {
    expect(() => startWorkloadEnvelope.parse({ kind: "not-a-kind", params: {} })).toThrow();
    expect(() => startWorkloadEnvelope.parse({ kind: "compute-themes", params: 7 })).toThrow();
  });

  // The DELIBERATE widening: the envelope does NOT enforce the kind's own params shape — that is the
  // contribution schema's job inside `start` (substrate/params.parseWorkloadInput), which maps a failure to
  // a BAD_REQUEST domain error. This test pins that the widening is intentional, not a regression.
  test("does NOT enforce per-kind params (the contribution schema is the authoritative validator)", () => {
    expect(() => startWorkloadEnvelope.parse({ kind: "index", params: {} })).not.toThrow();
  });
});
