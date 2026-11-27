// The `bug-reports` reader through the REAL binary (#1184), against a planted report directory.
//
// The three clauses this exists to hold are all about a reader that must never quietly mislead:
//   · a ZERO-report listing is a NAMED empty — it states the directory it scanned and how a report is made,
//     because these artifacts are gitignored and "nothing" would otherwise read as "wrong checkout" or
//     "feature not built";
//   · newest-FIRST is the order, derived from the stem's sortable timestamp;
//   · an AMBIGUOUS prefix REFUSES and lists the candidates. It never picks one — the ids are uuids nobody
//     retypes, so a guessing resolver turns "I read the wrong report" into a silent outcome.
//
// Driven with `cwd` pointed at a scratch tree, so the real cli's own `process.cwd()` root derivation is what
// is under test rather than a stubbed path.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bugReportStem } from "@orb/kit/bug-report";
import type { VersionIdentity } from "@orb/kit/version-identity";
import { expect, test } from "@orb/testkit/tooling";

interface PlantOpts {
  readonly id: string;
  readonly capturedAt: string;
  readonly note: string;
  readonly route?: string;
  readonly sha?: string | null;
  readonly dirty?: boolean;
  readonly truncated?: readonly string[];
  readonly withMarkdown?: boolean;
  /** The bundle's `version` block; a partial object plants an incomplete one a different writer could leave. */
  readonly version?: VersionIdentity | Readonly<Record<string, unknown>>;
}

/** Write one report pair into `<root>/bug-reports/`, in the exact shape the writer emits. */
async function plantReport(root: string, opts: PlantOpts): Promise<string> {
  const dir = join(root, "bug-reports");
  await mkdir(dir, { recursive: true });
  const stem = bugReportStem(new Date(opts.capturedAt), opts.id);
  const bundle = {
    id: opts.id,
    capturedAt: opts.capturedAt,
    build: { sha: opts.sha ?? "abcdef1234567890abcdef1234567890abcdef12", dirty: opts.dirty === true, statusHead: [] },
    window: { requestedFromAt: null, fromAt: null, padMs: 60_000, capturedAt: Date.parse(opts.capturedAt), requestedMinutes: null },
    note: opts.note,
    ...(opts.version === undefined ? {} : { version: opts.version }),
    client: { route: { pathname: opts.route ?? "/" }, sources: [] },
    server: {
      sources: (opts.truncated ?? []).map((source) => ({
        source,
        windowFilterable: true,
        cap: 32,
        held: 32,
        kept: 3,
        truncatedAt: Date.parse(opts.capturedAt),
      })),
      evidence: {},
      wireCaptureEnabled: true,
    },
  };
  await writeFile(join(dir, `${stem}.json`), JSON.stringify(bundle, null, 2), "utf8");
  if (opts.withMarkdown !== false) {
    await writeFile(join(dir, `${stem}.md`), `# Bug report ${opts.id}\n\n## What happened\n\n${opts.note}\n`, "utf8");
  }
  return stem;
}

test("an EMPTY checkout names the directory it scanned and how a report gets made — never a bare nothing", async ({ runCli, scratch }) => {
  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  // The directory it looked in — the fact that separates "none captured" from "wrong tree".
  expect(res.stdout).toContain(join(scratch, "bug-reports"));
  expect(res.stdout).toContain("no bug reports yet");
  // …and the capture path, so the reader is not left to guess where reports come from.
  expect(res.stdout).toContain("bug button");
  expect(res.stdout).toContain("pnpm bug:reports");
});

test("an existing but EMPTY directory is still a named empty (not the same arm, not a different silence)", async ({ runCli, scratch }) => {
  await mkdir(join(scratch, "bug-reports"), { recursive: true });
  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("is empty");
  expect(res.stdout).toContain(join(scratch, "bug-reports"));
});

test("a regular file where the report directory belongs is a tool failure, never a named empty", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "bug-reports"), "not a directory", "utf8");
  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain("ENOTDIR");
  expect(res.stdout).not.toContain("no bug reports yet");
});

test("lists NEWEST FIRST with the note, route, build identity and the truncation flag", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "aaaa1111", capturedAt: "2026-09-01T08:00:00.000Z", note: "the oldest one", route: "/" });
  await plantReport(scratch, {
    id: "bbbb2222",
    capturedAt: "2026-09-02T09:30:00.000Z",
    note: "the roster pane painted empty\nsecond line nobody should see in a listing",
    route: "/chats",
    dirty: true,
    truncated: ["motion().shifts"],
  });

  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("2 bug report(s)");

  const newest = res.stdout.indexOf("bbbb2222");
  const oldest = res.stdout.indexOf("aaaa1111");
  expect(newest).toBeGreaterThanOrEqual(0);
  expect(oldest).toBeGreaterThan(newest);

  // The listing is an INDEX: the first line of the note only.
  expect(res.stdout).toContain("the roster pane painted empty");
  expect(res.stdout).not.toContain("second line nobody should see");
  // The honesty columns a reader chooses a report by.
  expect(res.stdout).toContain("/chats");
  expect(res.stdout).toContain("+dirty");
  expect(res.stdout).toContain("TRUNCATED(1)");
});

test("a full id prints that report's digest and NAMES its json bundle", async ({ runCli, scratch }) => {
  const stem = await plantReport(scratch, { id: "cccc3333", capturedAt: "2026-09-02T10:00:00.000Z", note: "the composer ate my draft" });
  const res = await runCli("bug-reports", ["cccc3333"], { cwd: scratch });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("the composer ate my draft");
  expect(res.stdout).toContain(join(scratch, "bug-reports", `${stem}.json`));
});

test("a UNIQUE PREFIX resolves; the id does not have to be retyped whole", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "dddd4444", capturedAt: "2026-09-02T10:00:00.000Z", note: "prefix reachable" });
  const res = await runCli("bug-reports", ["dddd"], { cwd: scratch });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("prefix reachable");
});

test("an AMBIGUOUS prefix REFUSES and lists the candidates — it never picks one", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "eeee5555", capturedAt: "2026-09-02T10:00:00.000Z", note: "candidate one" });
  await plantReport(scratch, { id: "eeee6666", capturedAt: "2026-09-02T11:00:00.000Z", note: "candidate two" });

  const res = await runCli("bug-reports", ["eeee"], { cwd: scratch });
  await expect(res).toExitWith(1);
  expect(res.stdout).toContain("ambiguous");
  expect(res.stdout).toContain("eeee5555");
  expect(res.stdout).toContain("eeee6666");
  // The refusal is the WHOLE output: neither report's body was printed.
  expect(res.stdout).not.toContain("candidate one");
  expect(res.stdout).not.toContain("candidate two");
});

test("a ref that matches nothing refuses by naming the directory and the list command", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "ffff7777", capturedAt: "2026-09-02T10:00:00.000Z", note: "present" });
  const res = await runCli("bug-reports", ["nope"], { cwd: scratch });
  await expect(res).toExitWith(1);
  expect(res.stdout).toContain("no bug report matches");
  expect(res.stdout).toContain(join(scratch, "bug-reports"));
});

test("a bundle that will not parse is REPORTED, never silently dropped from the listing", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "aaaa8888", capturedAt: "2026-09-02T10:00:00.000Z", note: "readable" });
  await writeFile(join(scratch, "bug-reports", "2026-09-02T11-00-00-corrupt9.json"), "{ this is not json", "utf8");

  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("1 bug report(s)");
  expect(res.stdout).toContain("could NOT be read as a report");
  expect(res.stdout).toContain("2026-09-02T11-00-00-corrupt9");
});

test("this reader takes no flags — a flag-shaped argument is MISUSE, not a ref", async ({ runCli, scratch }) => {
  const res = await runCli("bug-reports", ["--all"], { cwd: scratch });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: pnpm bug:reports");
});

test("two arguments are misuse (list + show is the whole surface)", async ({ runCli, scratch }) => {
  const res = await runCli("bug-reports", ["aaaa", "bbbb"], { cwd: scratch });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: pnpm bug:reports");
});

const MAIN_BUILD: VersionIdentity = {
  version: "1.2.3",
  commit: "abcdef1234567890abcdef1234567890abcdef12",
  short: "abcdef123456",
  source: "checkout",
  channel: "main",
};
const STABLE_BUILD: VersionIdentity = { ...MAIN_BUILD, source: "container", channel: "stable", builtAt: "2026-09-02T08:00:00.000Z" };

test("the listing prints each report's version in the app's own format: `v<version>` stable, `<version>-dev+<short>` main", async ({ runCli, scratch }) => {
  await plantReport(scratch, { id: "gggg1111", capturedAt: "2026-09-02T10:00:00.000Z", note: "from a release", version: STABLE_BUILD });
  await plantReport(scratch, { id: "hhhh2222", capturedAt: "2026-09-02T09:00:00.000Z", note: "from main", version: MAIN_BUILD });

  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  const lines = res.stdout.split("\n");
  const stableLine = lines.find((line) => line.includes("gggg1111")) ?? "";
  const mainLine = lines.find((line) => line.includes("hhhh2222")) ?? "";
  expect(stableLine).toContain("  v1.2.3  ");
  expect(mainLine).toContain("  1.2.3-dev+abcdef123456  ");
  // The listing's own earlier spelling must not come back beside the app's.
  expect(res.stdout).not.toContain("checkout)");
  expect(res.stdout).not.toContain("container)");
});

test("a version block that is not a whole identity prints `no-version`, never a guessed label", async ({ runCli, scratch }) => {
  await plantReport(scratch, {
    id: "iiii3333",
    capturedAt: "2026-09-02T10:00:00.000Z",
    note: "block missing its channel",
    version: { version: "1.2.3", short: "abcdef123456", source: "checkout" },
  });
  await plantReport(scratch, { id: "jjjj4444", capturedAt: "2026-09-02T09:00:00.000Z", note: "older writer, no block at all" });

  const res = await runCli("bug-reports", [], { cwd: scratch });
  await expect(res).toExitWith(0);
  for (const id of ["iiii3333", "jjjj4444"]) {
    expect(res.stdout.split("\n").find((line) => line.includes(id))).toContain("  no-version  ");
  }
});
