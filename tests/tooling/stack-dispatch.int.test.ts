// Shell-level dispatch tests: these drive the REAL `scripts/dev/stack.sh` argument handling, not the
// parser it delegates to.
//
// WHY THIS FILE EXISTS. `tests/tooling/stack-mode.test.ts` pins `parseStackArgv` — and that was not
// enough, because the shell used to classify argv ITSELF and only ever looked for a mode in argument
// position 2. Anything it did not recognise fell through to DEV, silently, and the parser those unit
// tests pin never saw the argv at all. Three driven counterexamples (2026-08-07):
//   • `up --debug prod`   → ran the DEV stack with the debug surface armed
//   • `up --nope`         → ran the DEV stack, flag dropped on the floor
//   • `restart --force prod` → reached `do_force_restart`, which SIGKILLs whatever holds :8788/:5173
//     AND the entire detached vLLM fleet, drops the pidfile, then boots DEV
// A green unit suite over a parser the shell bypasses is a green suite over nothing. So every case below
// spawns bash on the actual script.
//
// MECHANISM: `STACK_DISPATCH_PROBE=1` makes stack.sh print its classification and exit immediately —
// after classification, before any action — so nothing is spawned, no port is touched, and the prod
// supervisor is never exec'd. `.int.test.ts` because it shells out; it writes nothing to the tree.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.ts";

const STACK_SH = fileURLToPath(new URL("../../scripts/dev/stack.sh", import.meta.url));

interface Dispatch {
  readonly status: number;
  readonly line: string;
  readonly stderr: string;
}

function dispatch(...argv: readonly string[]): Dispatch {
  const res = spawnSync("bash", [STACK_SH, ...argv], {
    encoding: "utf8",
    env: { ...process.env, STACK_DISPATCH_PROBE: "1" },
  });
  const line = (res.stdout ?? "").split("\n").find((l) => l.startsWith("DISPATCH ")) ?? "";
  return { status: res.status ?? -1, line, stderr: res.stderr ?? "" };
}

// ── the three refuted counterexamples ────────────────────────────────────────────────────────────────

test("a mode AFTER a flag still routes to prod — position 2 is not the only place a mode may appear", () => {
  const got = dispatch("up", "--debug", "prod");
  expect(got.status).toBe(0);
  expect(got.line).toContain("mode=prod");
  expect(got.line).toContain("debug=1");
});

test("an unknown flag EXITS 2 with usage — it never falls through to dev", () => {
  const got = dispatch("up", "--nope");
  expect(got.status).toBe(2);
  expect(got.line).toBe("");
  expect(got.stderr).toContain("unknown flag '--nope'");
  expect(got.stderr).toContain("usage: stack.sh");
});

test("`restart --force prod` REFUSES — the dev force-teardown must never run against a prod request", () => {
  // The defect this pins: force-restart SIGKILLs the :8788/:5173 holders AND the detached vLLM fleet,
  // ignoring ownership. Reaching it from an argv that said `prod` is a destructive verb aimed at the
  // wrong mode. Exit 2 and touch nothing.
  const got = dispatch("restart", "--force", "prod");
  expect(got.status).toBe(2);
  expect(got.line).toBe("");
  expect(got.stderr).toContain("--force is dev-only");
});

// ── nothing unclassifiable is allowed to proceed ─────────────────────────────────────────────────────

test("an unknown verb and a dev-only verb in prod both exit 2 with usage", () => {
  const unknown = dispatch("frobnicate");
  expect(unknown.status).toBe(2);
  expect(unknown.stderr).toContain("unknown verb 'frobnicate'");
  // start-fg is the Playwright webServer entry: it foregrounds vite and the caller reaps it. Prod has no
  // vite and detaches its own server, so this is a refusal rather than a silent dev fallback.
  const fg = dispatch("start-fg", "prod");
  expect(fg.status).toBe(2);
  expect(fg.stderr).toContain("dev-only");
});

test("--build is refused in dev at the SHELL, not silently ignored", () => {
  const got = dispatch("up", "--build");
  expect(got.status).toBe(2);
  expect(got.stderr).toContain("--build is prod-only");
});

// ── the pre-mode call sites still dispatch byte-identically ──────────────────────────────────────────

test("playwright / snap-stage / multi-user-fixture spellings survive the delegation", () => {
  // These three are spelled by NAME in playwright.config.ts, snap-stage.ts and multi-user-fixture.sh.
  expect(dispatch("start").line).toBe("DISPATCH verb=start mode=dev debug=0 force=0 rest=");
  expect(dispatch("stop").line).toBe("DISPATCH verb=stop mode=dev debug=0 force=0 rest=");
  expect(dispatch("start-fg").line).toBe("DISPATCH verb=start-fg mode=dev debug=0 force=0 rest=");
});

test("the dev force-restart spellings still reach the force path, and a bare call is status dev", () => {
  expect(dispatch("restart", "--force").line).toBe("DISPATCH verb=restart mode=dev debug=0 force=1 rest=");
  expect(dispatch("force-restart").line).toBe("DISPATCH verb=restart mode=dev debug=0 force=1 rest=");
  expect(dispatch().line).toBe("DISPATCH verb=status mode=dev debug=0 force=0 rest=");
});

test("logs passes its positional arguments through untouched", () => {
  expect(dispatch("logs", "server", "80").line).toBe("DISPATCH verb=logs mode=dev debug=0 force=0 rest=server 80");
});

test("prod routing carries the orthogonal flags", () => {
  expect(dispatch("up", "prod").line).toContain("mode=prod");
  expect(dispatch("status", "prod").line).toContain("verb=status mode=prod");
  const built = dispatch("up", "prod", "--debug", "--build");
  expect(built.line).toContain("mode=prod");
  expect(built.line).toContain("debug=1");
});
