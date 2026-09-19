// THE CT LISTING CLASSIFIER, pinned (#2457) — `lib/ct-listing.ts`, the pure read of what
// `playwright test --list --reporter=json` answered. Its op-side siblings (the bare `-g` refusal, the
// #2232 config-mode door) live in `tests/tooling/verify/ops/scoped-test.test.ts`.
import { classifyCtListing } from "../../../../tooling/src/verify/lib/ct-listing.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// ── #2457: the CT collection pass must never report a FAILED collection as a barren path ─────────────
//
// THE LIE, measured 2026-09-19 on the unmodified door (lane gate-X, re-deriving lane fold-V's receipt).
// A planted `.ct.tsx` importing a module that does not resolve:
//   pnpm test:ct tests/client/features/config/components/xlane-probe.ct.tsx
//     → exit 2, `UNFED PATH   path exists but the runner collected NO tests from it: …`
//       `usual causes: a --grep/--project/-t filter that excludes everything in the file, a support
//        module named as if it were a spec, or a spec whose every case is skipped.`
//   All three of those causes are wrong, and playwright's own
//   `Cannot find module …/xlane-does-not-exist/index.ts imported from …/xlane-probe.ct.tsx` was discarded.
// AFTER, same invocation: exit 2, `TOOL ERROR … reported 1 error(s) (status 1) — the selection was never
// collected`, carrying that message verbatim.
//
// THE OTHER DIRECTION IS THE HARD ONE, and it is why the discriminator is the error's CONTENT rather than
// the exit code or the emptiness of `errors`. A truly BARREN path (`export {};`) also exits 1 AND also
// reports an error — playwright's own `No tests found.` refusal, through the same report-level array.
// Measured both before and after the fix: `UNFED PATH`, exit 2. A status-driven or emptiness-driven
// classifier passes the load-error arm and silently destroys that one.
//
// The payloads below are the shapes those two runs produced (playwright 1.61.1's JSON reporter emits
// `{ config, suites, errors, stats }` with `errors` fed by `onError`), trimmed to the fields the
// classifier reads. Driving the pure classifier keeps the pin free of a chromium config load.
const CT_ROOT = "/repo";
const CT_PROBE = "tests/client/features/config/components/xlane-probe.ct.tsx";

function ctReport(body: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ config: { rootDir: CT_ROOT }, suites: [], errors: [], stats: {}, ...body });
}

/** Playwright's matched-nothing refusal, verbatim from the measured barren run. */
const NO_TESTS_FOUND_ERROR = {
  message:
    'Error: No tests found.\nMake sure that arguments are regular expressions matching test files.\nYou may need to escape symbols like "$" or "*" and quote the arguments.',
};

/** Its bare sibling, thrown when the selection named no locations (playwright has both spellings). */
const NO_TESTS_FOUND_BARE = { message: "Error: No tests found" };

const LOAD_ERROR = {
  location: { file: "<anonymous>", line: 0, column: 0 },
  message: `Error: Cannot find module '${CT_ROOT}/node_modules/@orb/client/src/features/xlane-does-not-exist/index.ts' imported from ${CT_ROOT}/${CT_PROBE}`,
};

test("a CT listing that failed to LOAD is a TOOL ERROR carrying playwright's own message, never a barren path", () => {
  const collection = classifyCtListing(CT_ROOT, { status: 1, stdout: ctReport({ errors: [LOAD_ERROR] }), stderr: "" });
  if (!("error" in collection)) {
    throw new Error("a failed collection must not come back as a file list");
  }
  expect(collection.error, "playwright's words survive — the whole point").toContain("Cannot find module");
  expect(collection.error, "and the importing spec it named").toContain(CT_PROBE);
  expect(collection.error, "said plainly enough that nobody reads it as a verdict").toContain("the selection was never collected");
  expect(collection.error, "the placeholder location is not printed as if it were a file").not.toContain("<anonymous>");
});

test("the OTHER direction: a matched-nothing listing stays an EMPTY COLLECTION, so the barren arm still owns it", () => {
  for (const refusal of [NO_TESTS_FOUND_ERROR, NO_TESTS_FOUND_BARE]) {
    const collection = classifyCtListing(CT_ROOT, { status: 1, stdout: ctReport({ errors: [refusal] }), stderr: "" });
    if ("error" in collection) {
      throw new Error(`a matched-nothing listing must stay a collection, got: ${collection.error}`);
    }
    expect(collection.files, "nothing was collected, and that is a real answer").toEqual([]);
  }
});

test("a load error BESIDE the matched-nothing refusal is still a TOOL ERROR — the load failure decides", () => {
  const collection = classifyCtListing(CT_ROOT, { status: 1, stdout: ctReport({ errors: [LOAD_ERROR, NO_TESTS_FOUND_ERROR] }), stderr: "" });
  expect("error" in collection, "one real failure is enough; the refusal that follows it explains nothing").toBe(true);
});

test("the passing direction: a clean listing yields the repo-relative spec files", () => {
  const stdout = ctReport({ suites: [{ file: CT_PROBE, specs: [{ title: "x" }] }] });
  const collection = classifyCtListing(CT_ROOT, { status: 0, stdout, stderr: "" });
  if ("error" in collection) {
    throw new Error(`a clean listing must not be an error: ${collection.error}`);
  }
  expect(collection.files).toEqual([CT_PROBE]);
});

test("an unparsable body is still a TOOL ERROR and carries what the runner actually printed", () => {
  const collection = classifyCtListing(CT_ROOT, { status: 1, stdout: "", stderr: "playwright: command exploded" });
  if (!("error" in collection)) {
    throw new Error("an unparsable body must not come back as a file list");
  }
  expect(collection.error).toContain("produced no JSON");
  expect(collection.error).toContain("playwright: command exploded");
});
