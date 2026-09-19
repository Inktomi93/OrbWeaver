// THE CT LISTING CLASSIFIER (#2457) — what `playwright test --list --reporter=json` ANSWERED, turned into
// a collection or into the reason the question was never answered.
//
// WHY IT IS A `lib/` MODULE AND NOT PART OF ITS OP. It is a PURE function of one spawn result, which is
// exactly what lets the pin drive both directions without a chromium config load — and `ops/scoped-test.ts`
// crossed `tooling-size`'s 450-line hard cap when it grew. The split is along the honest seam: the op owns
// the SPAWN and the preflight verdict, this module owns the READ.
//
// THE LIE IT EXISTS TO STOP, measured 2026-09-19 on the unmodified door. The first version read the suite
// tree and NOTHING else — not `status`, not the report's own `errors` array. A CT that fails to LOAD
// node-side collects zero suites, so the door printed `UNFED PATH` with three causes that were all wrong
// and DISCARDED playwright's real message; in a multi-path batch the whole selection was refused as barren
// and the other files never ran. A collection that FAILED is a TOOL ERROR carrying the vendor's own words,
// never a verdict about the caller's paths.
//
// THE DISCRIMINATOR IS THE CONTENT OF `errors`, not its emptiness and not the exit code: listing runs with
// `failOnLoadErrors: true`, so a selection that matched NOTHING reports `No tests found` through the same
// array and also exits non-zero. That case is a real (empty) collection which the barren arm then reports
// per-operand — the direction the pin plants alongside the load failure.
import { resolve } from "node:path";
import { toRepoRelative } from "@orb/tooling/_shared/scoped-run-paths";
import type { ScopedTestCollection } from "../contract/scoped-test.ts";

/** A property of an unknown record, or undefined — the runners' JSON is vendor data, not our shape. */
function readProperty(entry: unknown, key: string): unknown {
  if (typeof entry !== "object" || entry === null || !(key in entry)) {
    return;
  }
  return (entry as Record<string, unknown>)[key];
}

/** The same read, narrowed to the string case, which is every field these two listings are read for. */
export function readField(entry: unknown, key: string): string | undefined {
  const value = readProperty(entry, key);
  return typeof value === "string" ? value : undefined;
}

/** Walk the playwright JSON suite tree collecting every `file`. Nested suites repeat the field, so one
 *  recursive read covers both the top-level grouping and per-describe nesting. */
function walkSuiteFiles(node: unknown, rootDir: string, root: string, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkSuiteFiles(child, rootDir, root, out);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const file = readField(node, "file");
  if (file !== undefined) {
    out.add(toRepoRelative(root, resolve(rootDir, file)));
  }
  for (const key of ["suites", "specs"]) {
    if (key in node) {
      walkSuiteFiles((node as Record<string, unknown>)[key], rootDir, root, out);
    }
  }
}

/** What `playwright test --list` answered. Split out so the CLASSIFICATION below is a pure function the
 *  pin can drive in both directions without spawning a chromium config load. */
export interface CtListing {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Playwright's own refusal when its filters matched no spec at all — measured 2026-09-19 against
 *  playwright 1.61.1, whose load task throws `No tests found` (bare) or the `No tests found.` +
 *  "Make sure that arguments are regular expressions…" variant when the selection named locations. It
 *  arrives through the SAME report-level `errors` channel a LOAD FAILURE uses, which is why the classifier
 *  below discriminates on the message and never on emptiness or on the exit code: this one is a legitimate
 *  EMPTY collection the barren arm must still own, every other one means nothing was collected at all. */
const CT_NO_TESTS_FOUND = "No tests found";
/** How the reporter serializes a thrown `Error` into `message` — stripped before the match above. */
const CT_ERROR_PREFIX = "Error: ";
/** Playwright's placeholder when an error has no source position (a module-resolution failure names the
 *  importer inside its own message instead), so printing it as a location adds nothing. */
const CT_ANONYMOUS_LOCATION = "<anonymous>";

/** One reported error as a line an operator can act on — playwright's own message, with the source
 *  position when it carries one (a load failure does; the matched-nothing refusal does not). */
function formatCtError(error: unknown): string {
  const file = readField(readProperty(error, "location"), "file");
  const message = readField(error, "message") ?? readField(error, "value") ?? readField(error, "stack") ?? String(JSON.stringify(error));
  return file === undefined || file === CT_ANONYMOUS_LOCATION ? message : `${file}: ${message}`;
}

function isNoTestsFound(error: unknown): boolean {
  const message = readField(error, "message") ?? "";
  const thrown = message.startsWith(CT_ERROR_PREFIX) ? message.slice(CT_ERROR_PREFIX.length) : message;
  return thrown.startsWith(CT_NO_TESTS_FOUND);
}

/** `playwright test --list --reporter=json` → the specs the caller's filters select, or the reason the
 *  question was never answered.
 *
 *  THE LIE THIS CLASSIFIER EXISTS TO STOP (#2457, found by lane fold-V 2026-09-19). The first version read
 *  the suite tree and NOTHING else — not `status`, not the report's own `errors` array. A CT that fails to
 *  LOAD node-side (importing a feature front door out of an `@orb/client` subpath, say) collects zero
 *  suites, so the door printed `UNFED PATH` with three causes that were all wrong and DISCARDED
 *  playwright's real message; in a multi-path batch the whole selection was refused as barren and the other
 *  files never ran. A collection that failed is a TOOL ERROR carrying the vendor's own words, never a
 *  verdict about the caller's paths.
 *
 *  The discriminator is the CONTENT of `errors`, not its emptiness and not the exit code: listing runs with
 *  `failOnLoadErrors: true`, so a selection that matched nothing reports `No tests found` through the same
 *  array and exits non-zero. That case is a real (empty) collection which the barren arm then reports
 *  per-operand — the direction the pin plants alongside the load failure. */
export function classifyCtListing(root: string, listing: CtListing): ScopedTestCollection {
  const start = listing.stdout.indexOf("{");
  const end = listing.stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: `\`playwright test --list\` produced no JSON (status ${String(listing.status)})\n${listing.stderr || listing.stdout}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(listing.stdout.slice(start, end + 1));
  } catch (err) {
    return { error: `\`playwright test --list\` produced invalid JSON: ${String(err)}` };
  }
  const report = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const reported: readonly unknown[] = Array.isArray(report["errors"]) ? (report["errors"] as readonly unknown[]) : [];
  const failures = reported.filter((error) => !isNoTestsFound(error));
  if (failures.length > 0) {
    return {
      error:
        `\`playwright test --list\` reported ${String(failures.length)} error(s) (status ${String(listing.status)}) — the selection was never collected, ` +
        "so this run is not a verdict about any path in it:\n" +
        failures.map((error) => `  ${formatCtError(error)}`).join("\n"),
    };
  }
  const rootDir = readField(report["config"], "rootDir") ?? root;
  const files = new Set<string>();
  walkSuiteFiles(report["suites"], rootDir, root, files);
  // Playwright's suite tree carries no project attribution this door needs; the CT arm has one config and
  // no typecheck projects, so the #2232 runtime-only question does not arise for it.
  return { files: [...files], projects: [] };
}
