// The shape of the committed TEST BASELINE at docs/test-baseline/manifest.json — the monotonic-tests
// gate's tooth-2 floor (a listed spec that vanished off disk without a `deletions` entry is RED). Homed in
// contract/ because THREE modules speak it: the generator that derives + writes it
// (ops/gen/test-baseline-manifest.ts), the freshness stage that compares the committed file against a fresh
// derivation (ops/ledgers-fresh.ts), and the gate that reads it (gates/monotonic-tests.ts). One home for
// the path constant too — three spellings of the same repo-relative path is three places a move can rot.

/** The committed path, repo-relative, posix. */
export const TEST_BASELINE_REL = "docs/test-baseline/manifest.json";

/** One accounted deletion. `why` states the reason AND what would un-delete it (GATE-AUTHORING §4.2). */
export interface TestBaselineDeletion {
  readonly why: string;
}

/** Tracked specs plus unaccounted removed members, sorted; accounted deletions survive regeneration. */
export interface TestBaselineManifest {
  readonly testFiles: readonly string[];
  readonly deletions: Readonly<Record<string, TestBaselineDeletion>>;
}
