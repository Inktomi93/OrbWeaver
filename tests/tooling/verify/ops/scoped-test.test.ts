// Scoped node runs select the projects Vitest attributes to the caller's test files.
// Typecheck projects use `ignoreSourceErrors` so they judge `.test-d.ts` assertions only.
// The native typecheck stage owns source diagnostics across every discovered compiler program.
import { bareCtGrepRefusal, classifyCtListing, hasCallerProjectFilter, nodeConfigModeArgs } from "../../../../tooling/src/verify/ops/scoped-test.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const RUNTIME_ONLY = "--runtime-only";

test("a runtime-only selection spawns with --runtime-only and no project filter", () => {
  expect(nodeConfigModeArgs(["tooling"], "run", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["unit", "integration"], "run", false)).toEqual([RUNTIME_ONLY]);
});

test("an EMPTY attribution is a runtime-only run — a bare --grep claims no type file", () => {
  expect(nodeConfigModeArgs([], "run", false)).toEqual([RUNTIME_ONLY]);
});

test("a pure .test-d.ts selection names the types project the runner attributed", () => {
  expect(nodeConfigModeArgs(["types-node"], "run", false)).toEqual(["--project=types-node"]);
  expect(nodeConfigModeArgs(["types-browser", "types-node"], "run", false)).toEqual(["--project=types-browser", "--project=types-node"]);
});

// THE ARM THE FIRST DRAFT GOT WRONG. It returned `[]` here, so the root config rode and BOTH typecheck
// projects joined a run that claimed one of them. The union drops nothing the caller claimed and excludes
// the one they did not — `types-browser` is absent from every row below.
test("a MIXED selection narrows to the UNION of the attributed projects, never to nothing", () => {
  expect(nodeConfigModeArgs(["tooling", "types-node"], "run", false)).toEqual(["--project=tooling", "--project=types-node"]);
  expect(nodeConfigModeArgs(["types-browser", "unit"], "run", false)).toEqual(["--project=types-browser", "--project=unit"]);
  expect(nodeConfigModeArgs(["contract", "integration", "types-node", "unit"], "run", false), "the doc-catalog shape").toEqual([
    "--project=contract",
    "--project=integration",
    "--project=types-node",
    "--project=unit",
  ]);
});

test("a MIXED selection never emits the runtime-only flag, and never names an unclaimed typecheck project", () => {
  for (const projects of [
    ["tooling", "types-node"],
    ["types-browser", "unit"],
    ["contract", "types-node"],
  ]) {
    const args = nodeConfigModeArgs(projects, "run", false);
    expect(args, `${projects.join(",")} must not carry the flag`).not.toContain(RUNTIME_ONLY);
    expect(args, "every attributed project survives").toHaveLength(projects.length);
    const unclaimed = projects.includes("types-node") ? "types-browser" : "types-node";
    expect(args, `${unclaimed} was never claimed`).not.toContain(`--project=${unclaimed}`);
  }
});

// The two flags are mutually exclusive by construction: the runtime config OMITS the typecheck projects
// before any `--project` filter applies, so `--runtime-only --project=types-node` selects nothing at all.
test("the runtime-only flag and a types project are never emitted together", () => {
  for (const projects of [["types-node"], ["types-browser"], ["types-browser", "types-node"], ["tooling", "types-node"]]) {
    expect(nodeConfigModeArgs(projects, "run", false)).not.toContain(RUNTIME_ONLY);
  }
});

// THE REGRESSION THE FIRST DRAFT SHIPPED. `preflight` returns an empty attribution without collecting when
// there are no path operands, so `--runtime-only` was injected beside the caller's own filter and vitest
// refused: `Startup Error: No projects matched the filter "types-node"`. An invocation that worked before
// the door existed.
test("a caller's OWN --project filter is authoritative — the door adds nothing", () => {
  expect(nodeConfigModeArgs([], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs(["tooling"], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs(["types-node"], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs([], "related", true), "even related yields to an explicit filter").toEqual([]);
});

test("both --project spellings are recognised — a door reading only the =-joined form still contradicts the other", () => {
  expect(hasCallerProjectFilter(["--project=types-node"])).toBe(true);
  expect(hasCallerProjectFilter(["--project", "types-node"])).toBe(true);
  expect(hasCallerProjectFilter(["-t", "x", "--project=unit", "--reporter=json"])).toBe(true);
  expect(hasCallerProjectFilter(["-t", "x"]), "the negative control").toBe(false);
  expect(hasCallerProjectFilter(["--projects-are-not-a-flag"]), "a prefix that is not the flag").toBe(false);
});

// `--related` operands are SOURCE files; the type-assertion lane's own door is `pnpm test:types`
// (the `types-*` projects). Left un-flagged, every related run carries the typecheck projects' programs.
test("--related is runtime-only whatever the attribution says", () => {
  expect(nodeConfigModeArgs([], "related", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["types-node"], "related", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["tooling", "types-node"], "related", false)).toEqual([RUNTIME_ONLY]);
});

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

// ── #2457, second half: a bare CT title filter is refused at PARSE ───────────────────────────────────
//
// Measured 2026-09-19 on the unmodified door: `pnpm test:ct -g='aria-expanded follows'` — a title that
// really does live in tests/client/features/config/components/config-search-input.ct.tsx — printed
// `CT SUMMARY — FAILED · 0 passed · 0 failed · 0 flaky · 0 skipped` and exited 1. The preflight cannot
// catch it: with no path operands it returns early and never collects, so there is no barren path to name.
test("a bare -g/--grep on the CT tier is refused, and the refusal names the missing path operand", () => {
  for (const argv of [["-g=chat composer"], ["-g", "chat composer"], ["--grep=chat composer"], ["--grep", "chat composer"]]) {
    const refusal = bareCtGrepRefusal(argv, 0);
    expect(refusal, `${argv.join(" ")} must be refused`).toBeDefined();
    expect(refusal, "the operator is told what to add").toContain("needs a path operand");
    expect(refusal, "with the spelling that works").toContain("pnpm test:ct tests/ui/x.ct.tsx -g=");
    expect(refusal, "and the flag is named, not echoed with its value").not.toContain("chat composer");
  }
});

test("the negative controls: a title filter WITH a path, and a run with no title filter at all, are not refused", () => {
  expect(bareCtGrepRefusal(["-g=chat composer"], 1), "a path operand makes the invocation real").toBeUndefined();
  expect(bareCtGrepRefusal(["--workers=2"], 0), "no title filter, nothing to refuse").toBeUndefined();
  expect(bareCtGrepRefusal(["--grep-invert=slow"], 0), "grep-invert narrows a full run; it does not claim a title").toBeUndefined();
});
