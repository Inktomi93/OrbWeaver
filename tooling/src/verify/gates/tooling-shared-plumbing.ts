// Gate: tooling-shared-plumbing (docs/architecture/core/Core-Tooling-Law.md §4.4) — ONE home per plumbing capability.
// Arms: (A) ts-morph `new Project(` outside _shared/ts-workspace.ts; (B) playwright `<engine>.launch(`
// outside _shared/browser.ts; (C) a "reports"/"reports/…" literal fed to join/resolve/mkdir/mkdirSync
// outside _shared/artifacts.ts; (D) `process.exit(` outside _shared/run-tool.ts (a bare exit drops the
// pipe AND dodges the exit-honesty runner); (E) a tool cli.ts that does not enter through runTool;
// (F) a `node:child_process` import outside _shared/proc.ts (a direct spawn bypasses the nice -19
// homelab floor), with full-priority-door callers allowlisted in FULL_PRIORITY_CALLERS and the
// NON-WORKSPACE ts-morph constructions censused in PROJECT_SITES; (G) a tool that FILES an artifact
// (artifactDir/artifactFile) whose cli.ts never opens a run slot (withInstrumentRun) — the #1164
// concurrency class, where two runs of one instrument overwrite each other's artifacts; (H) a playwright
// `<engine>.connectOverCDP(` / `<engine>.connect(` outside _shared/browser.ts — a second ATTACH site
// (docs/design/1208-instrument-substrate.md §3.4: `attachProbeSession` is the one door onto a session
// daemon's browser; a raw attach elsewhere is a shim-leak and a second ProbeSession shape). Declared
// limit: puppeteer's `connect` (the Lighthouse engine's own seam, phase 3) is not this arm's — its row
// is the mustPass below.
// (I) a PORT LITERAL outside the ONE port registry (_shared/ports.ts): a numeric literal whose VALUE is a
// registry port (reserved or stage-band — the arm imports the registry, so a new reserved row widens it for
// free), or a numeric literal sitting at a PORT-NAMED position (`port`/`…Port`/`…_PORT`) carrying a number
// the registry never declared — i.e. a hand-picked pair, pain P10 (docs/design/1208-instrument-substrate.md
// §3.6, #1269/#1271). Arm I's jurisdiction is `tooling/src/**` + `tests/e2e/support/**` + the root
// `playwright*.config.ts` files (discovered by readdir past the anchor, read through the ONE scratch
// parser like arm J's root configs — no gate's node walk reaches a repo-root file).
// DECLARED LIMITS: (1) a port inside a STRING (`"http://localhost:5173"`) is not a numeric literal and is
// not judged — `tests/e2e/support/target-guard.test.ts` deliberately spells the dev origins as negative
// fixture data; (2) the three SHELL launchers (stack.sh 8788/5173, multi-user-fixture.sh 8790/5175,
// engines.sh 8701-8703) are the mirror side by LANGUAGE — bash cannot import a TS module — and
// `packages/client/vite.config.ts` is the mirror side by CAKE (importing @orb/tooling from packages/** is
// an upward import, constitution §2; and its two values are env-overridable DEFAULTS, not hardcodes). Both
// mirrors are a RULED exclusion (owner, 2026-09-02), named in ports.ts's header, not a deferral.
// (J) a WALL-CLOCK LITERAL outside the ONE budget policy (_shared/load-budget.ts): a numeric literal fed
// to a `timeout`/`timeoutMs`/`testTimeout`/`hookTimeout`/`actionTimeout` option, a `setTimeout(fn, N)` at
// ceiling scale, or a `*_TIMEOUT_MS` const with a bare numeric initializer. A budget written for a quiet
// box reads as a RED on a contended one; every ceiling is `budget(<X>_BASE_MS)` (#1232,
// docs/design/1208-instrument-substrate.md §7.1). Arm J's jurisdiction is WIDER than the others'
// (tests/tooling/** too, plus the two root runner configs read off disk in run()); arms A-H stay fenced to
// tooling/src/ exactly as before (arm H included — `visit` applies the TOOLING_PREFIX fence before
// `capability()` ever runs, which is what keeps test-owned browsers out of the substrate, §2.1).
// Scan-and-allowlist: the HOMES are SCANNED and carried as cited rows with a stale sweep (GATE-AUTHORING §4). Comment posture: comment-SAFE (node kinds + literal args).
import { existsSync, readdirSync } from "node:fs";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { RESERVED_PORT_NUMBERS, STAGE_BAND_PORT_NUMBERS } from "../../_shared/ports.ts";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { readStaticSource } from "../lib/config-static-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const TOOLING_PREFIX = "tooling/src/";
/** Arm J ONLY — arms A-G fence themselves to TOOLING_PREFIX inside `visit`. */
const TESTS_TOOLING_PREFIX = "tests/tooling/";
/** Arm I ONLY — the e2e support tree owns the auth-mode stacks' port pairs, so it is the second place a
 *  hand-picked pair has historically been born. Arm J does NOT judge it (its clocks are e2e boot budgets,
 *  #1232's territory), which is why every arm fences its own jurisdiction rather than riding `scanRoot`. */
const E2E_SUPPORT_PREFIX = "tests/e2e/support/";
const ANCHOR = "tooling/src/_shared/exit-contract.ts";

/** capability → its ONE sanctioned home (repo-relative). The stale sweep reds a row whose home was never
 *  seen carrying its capability on a real-tree run — a moved home must go RED at its new path, never
 *  silently keep its exemption (GATE-AUTHORING §4.4a). */
const HOMES: ExemptionTable & Readonly<Record<string, { readonly why: string }>> = {
  "tooling/src/_shared/ts-workspace.ts": { why: "the ONE ts-morph loader (getWorkspace) — ends only if the loader itself moves, which re-keys this row" },
  "tooling/src/_shared/browser.ts": { why: "the ONE Playwright bootstrap (launchProbeSession) — same end condition" },
  "tooling/src/_shared/artifacts.ts": { why: "the ONE reports/<kind> artifact filer — same end condition" },
  "tooling/src/_shared/run-tool.ts": { why: "the ONE exit-honesty runner (the crash path's hard exit lives here) — same end condition" },
  "tooling/src/_shared/proc.ts": { why: "the ONE child_process door (nice -19 floor) — same end condition" },
};

/** The un-niced spawn doors proc.ts exposes — the SYNC one (a boot a human waits on) and the DETACHED
 *  CHILD one (a long-lived server that IS the workload). Both are loud by name so their callers form a
 *  census; adding a third door means adding it here or the gate stops seeing it. */
const FULL_PRIORITY_DOORS = new Set(["spawnFullPrioritySync", "spawnFullPriorityChild"]);

/** Full-priority-door callers — the census'd un-niced exceptions. Every row states why nice is WRONG
 *  there; a call outside these rows is RED, and a row whose file no longer calls one is stale. */
const FULL_PRIORITY_CALLERS: ExemptionTable = {
  "tooling/src/snap/ops/stage.ts": {
    why: "the stage stack BOOT serves interactive snap navigations — a -19 staged app times out captures under load; ends if the stage boot moves or drops the exception",
  },
  "tooling/src/stack/ops/engines.ts": {
    why: "the vLLM engines ARE the inference workload the operator waits on — a -19 engine degrades the interactive token latency the fleet exists to provide; ends if the fleet launcher moves or stops spawning",
  },
  "tooling/src/stack/ops/prod-up.ts": {
    why: "the child it spawns IS the production server answering the operator's requests — a -19 app is the thing the launcher exists to run, degraded; ends if the prod spawn moves or drops the exception",
  },
};

/** NON-WORKSPACE ts-morph Projects — arm A's censused exceptions. The one-loader rule (arm A) exists so
 *  the shared WORKSPACE is loaded ONCE; a Project over something that is NOT the workspace cannot be
 *  `getWorkspace()` at all. Every row names WHAT it loads and what would end it; the stale sweep reds a row
 *  whose file stopped constructing one. Distinct from HOMES on purpose: a HOMES file is exempt from EVERY
 *  arm, a PROJECT_SITES file is exempt from arm A ONLY. */
const PROJECT_SITES: ExemptionTable = {
  "tooling/src/verify/lib/comment-spans.ts": {
    why: "an in-memory SCRATCH parser (`useInMemoryFileSystem`) for ONE string of text read off real disk — it resolves no dependency and walks no workspace; it exists so a `//` inside a string literal is still not a comment. Ends if comment blanking ever reads from the shared project instead of raw text.",
  },
  "tooling/src/verify/lib/baseui-read.ts": {
    why: "loads the INSTALLED @base-ui/react `.d.ts` surface out of packages/ui/node_modules — not workspace source, not in harnessGlobs, and unreadable any other way, so the manifest would have nothing to adjudicate against. Ends if the surface is ever vendored INTO the workspace.",
  },
  "tooling/src/verify/ops/conformance.ts": {
    why: "materializes each gate's mustFlag/mustPass example as its OWN synthetic mini-project (in-memory, or a real temp dir for an fsBacked gate) — a self-proof run over the shared workspace would prove nothing about the example. Ends if conformance stops being example-driven.",
  },
  "tooling/src/verify/gates/dangling-refs.ts": {
    why: "fsBacked: reads gate descriptor SOURCE off real disk (readdirSync over the gates dir) so it works identically inside a conformance temp tree, where the shared workspace does not exist. Ends if the arm is folded onto the shared project the way diagnostic-legibility was (§2.2).",
  },
  "tooling/src/verify/lib/config-static-read.ts": {
    why: "ONE scratch parser (`useInMemoryFileSystem`) for exact code outside the governed workspace corpus: the root eslint/dep-cruiser configs and Playwright's CT bootstrap. Loading the bootstrap into harnessGlobs would widen every gate's jurisdiction; separate parsers per consumer would violate the one-parser census. Ends if all three files join the governed corpus or stop needing AST reads.",
  },
  "tooling/src/verify/gates/enforcement-registry-parity.ts": {
    why: "fsBacked, same reason as dangling-refs: it reconciles the on-disk gate corpus against the enforcement doc, and a conformance temp tree has no shared workspace to read from. Ends on the same diagnostic-legibility-style fold-in.",
  },
};

const PATH_CALLEES = new Set(["join", "resolve", "mkdir", "mkdirSync"]);
const LAUNCH_ENGINES = new Set(["chromium", "firefox", "webkit"]);
/** Arm H's door set — Playwright's two attach verbs on a browser type. Matched as a SET with arm B's
 *  engines as receivers, so a third attach spelling on the same receiver is a loophole only until it joins. */
const ATTACH_METHODS = new Set(["connectOverCDP", "connect"]);

/** Arm J's ONE sanctioned home plus the CENSUSED exceptions (scan-and-allowlist, GATE-AUTHORING §4.4 mode
 *  B: this table IS the current census and it is SHRINK-ONLY — a new fixed clock is RED, never a new row).
 *  Every row states why the clock is deliberately fixed AND what ends the exemption; the stale sweep in
 *  run() reds a row that no longer carries a wall-clock literal, so a fixed clock that gets scaled must
 *  delete its row in the same commit. */
const CLOCK_SITES: ExemptionTable = {
  "tests/tooling/tool-guard.int.test.ts": {
    why: "the `timeout` here is the guard's INPUT UNDER TEST — an agent-chosen value handed to `runBatch` so the suite can assert the guard does not override it. It is fixture data, not a clock this run pays, and scaling it would make the fixture describe a box instead of an agent. Ends if the suite stops feeding a literal timeout to the guard.",
  },
  "tests/tooling/verify/ops/structure.int.test.ts": {
    why: "ONE deliberate SHORT kill (line ~215): a planted-hang gate is run under a 4s ceiling and the assertion IS `timedOut === true`. Scaling it would stretch the proof of the timeout path itself — the budget is the subject, not the tolerance. The file's other ceilings ARE scaled. Ends if the hang probe stops asserting its own kill.",
  },
};

/** Arm I's ONE sanctioned home. Scan-and-allowlist, not a scanRoot exclusion (GATE-AUTHORING §3): the
 *  registry is SCANNED and absolved by this cited row, so if it ever moves it goes RED at its new path
 *  instead of carrying its exemption along silently. The stale sweep in run() reds the row the day the
 *  registry stops carrying port literals — which is the day it stopped being the registry. */
const PORT_HOME: ExemptionTable = {
  "tooling/src/_shared/ports.ts": {
    why: "THE port registry — the one home every reserved row and stage band is declared in, and the table this arm imports to know what a port number even is. Ends only if the registry moves, which re-keys this row.",
  },
};
const seenPortHome = new Set<string>();

/** Every number the registry declares — reserved rows AND stage bands. IMPORTED, never re-spelled: adding a
 *  reserved row to ports.ts widens this arm for free, which is the "key off a LIVE single source of truth"
 *  shape (GATE-AUTHORING §10) and the only way the arm cannot drift from the thing it protects. */
const REGISTRY_PORTS: ReadonlySet<number> = new Set([...RESERVED_PORT_NUMBERS, ...STAGE_BAND_PORT_NUMBERS]);

/** A declaration/property NAME that means "this number is a TCP port". The name-shaped half exists because
 *  the value-shaped half can only see ports the registry ALREADY knows: a hand-picked NEW pair (P10's
 *  actual pain — "picking a pair meant grepping and hoping") carries a number in no table, and only its
 *  name gives it away. `port`, `ctPort`, `serverPort`, `FIXTURE_PORT`, `DEV_VITE_PORT` all land here. */
const PORT_NAME_RE = /^port$|Port$|_PORT$|^PORT$/u;

/** The root playwright configs are DISCOVERED, never listed: a hard-coded path constant dies silently on a
 *  rename (GATE-AUTHORING §3), and a `playwright-<something>.config.ts` added tomorrow must be judged
 *  without anyone remembering to edit this file. Zero matches is RED, not silence (§4.6). */
const PLAYWRIGHT_CONFIG_RE = /^playwright.*\.config\.ts$/u;

/** Property names whose numeric value IS a wall clock. A nested option object reaches this list through its
 *  INNER property (playwright's expect-timeout and the use-block action timeout both land here), which is
 *  the point — the arm reads the LEAF, never the wrapper. */
const CLOCK_KEYS = new Set(["timeout", "timeoutMs", "testTimeout", "hookTimeout", "actionTimeout", "navigationTimeout"]);

/** A `setTimeout(fn, N)` below this is a SETTLE — a sleep the run always pays — and a settle is not a
 *  budget (it is never scaled, §7.1). At or above it, the literal is a ceiling wearing a sleep's clothes. */
const SETTLE_CEILING_MS = 5000;

/** A const NAMED as a wall clock. The name-shaped arm exists because a literal moved ONE LINE UP — declare
 *  `STEP_TIMEOUT_MS` as a bare 5000, then hand the identifier to the timeout option — dodges the property
 *  arm entirely; it is exactly how screen-record's two ceilings sat unscaled outside any lib/budgets.ts.
 *  A name carrying BASE is the SANCTIONED shape (declare `NAV_TIMEOUT_BASE_MS`, export the ceiling as
 *  `budget(NAV_TIMEOUT_BASE_MS)`) and is not flagged.
 *  `*_BUDGET_MS` is DELIBERATELY NOT in the pattern. The first draft included it and the census caught
 *  motion-audit's `BLOCKING_BUDGET_MS = 50` — a VERDICT THRESHOLD, not a wall clock. Scaling a threshold
 *  would WIDEN THE VERDICT on a loaded box, which is precisely the third arm #1040 forbids ("withhold,
 *  don't red" — never widen); a rate-shaped threshold's answer to load is the WITHHOLD, not a multiplier.
 *  THE ARM'S DECLARED LIMIT: it judges SPELLING, not data flow — a BASE const handed straight to a
 *  `timeout` option without `budget()` passes. Proving that would need the type checker on every call
 *  site; the cheap half is enforced here and the expensive half is the reviewer's. */
const CLOCK_NAME_RE = /(?:_TIMEOUT_MS|TimeoutMs)$/u;
const BASE_NAME_RE = /BASE|Base/u;

/** The two ROOT runner configs. They are outside `harnessGlobs` (which covers packages/*​/src, tests/,
 *  tooling/src/, scripts/), so no gate's node walk can ever see them — and they carry the two clocks that
 *  cost the most: the CT `mount()` timeout and the vitest lane timeouts. Read off disk through the ONE
 *  scratch parser instead (the config-static-read precedent), guarded by the real-tree anchor so a
 *  conformance mini-project never reaches for them. */
const ROOT_CONFIGS: readonly string[] = ["vitest.config.ts", "playwright-ct.config.ts"];

const seenClockSites = new Set<string>();
const seenHomes = new Set<string>();
const seenFullPriorityCallers = new Set<string>();
const seenProjectSites = new Set<string>();
const CLI_RE = /^tooling\/src\/[^/]+\/cli\.ts$/u;

/** Arm G's two halves: the tools that FILE an artifact, and the tools whose cli.ts opens a run slot for
 *  it. A tool in the first set and not the second writes into the shared `reports/<kind>/` with no run
 *  identity — the #1164 clobber class, where two lanes' default `--out` names destroy each other. */
const ARTIFACT_FILERS = new Set(["artifactDir", "artifactFile"]);
const filingTools = new Map<string, string>();
const slottedTools = new Set<string>();
/** The plumbing's own home files are not a tool with a cli — they DEFINE the filing doors. */
const SHARED_DIR = "_shared";

/** `tooling/src/<tool>/…` → `<tool>`. */
function toolOf(rel: string): string {
  return rel.split("/")[2] ?? "";
}

/** Absolute path to repo-relative, for the THREE roots this gate judges. IT MUST KNOW ABOUT ALL OF THEM,
 *  and this is the single most dangerous line in the file: the original single-prefix form returned null for
 *  every `tests/tooling/**` file, so arm J's widened `scanRoot` admitted them and `visit` silently dropped
 *  every one — a green arm over a jurisdiction it never read. Caught by the planted control, not by the zero
 *  (2026-09-02). `tests/e2e/support/` joined for arm I on the same day and owes the same control. A widened
 *  `scanRoot` whose prefix list did not widen with it is ALWAYS this bug. */
function relOf(abs: string): string | null {
  const norm = abs.replace(/\\/gu, "/");
  for (const prefix of [TOOLING_PREFIX, TESTS_TOOLING_PREFIX, E2E_SUPPORT_PREFIX]) {
    const i = norm.indexOf(`/${prefix}`);
    if (i !== -1) {
      return norm.slice(i + 1);
    }
  }
  return null;
}

/** Arm C: a "reports"/"reports/…" string literal among a path-call's arguments. */
function reportsPathArg(node: Node, calleeName: string): string | null {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return null;
  }
  for (const arg of node.getArguments()) {
    const v = readStringValue(arg);
    if (v !== undefined && (v === "reports" || v.startsWith("reports/"))) {
      return `"${v}" in ${calleeName}(`;
    }
  }
  return null;
}

/** Arm F's import check (module-specifier match) — its home is proc.ts. */
function childProcessImport(node: Node): string | null {
  if (!node.isKind(SyntaxKind.ImportDeclaration)) {
    return null;
  }
  return node.getModuleSpecifierValue() === "node:child_process" ? 'import "node:child_process"' : null;
}

/** The NAME a numeric literal is bound to (`const x = 8788` / `{ port: 8788 }`), or null when the literal
 *  sits in an unnamed position (a call argument, an array element). Read through the PARENT rather than a
 *  text match, so `x as never`/parenthesized wrappers cannot hide the binding. */
function boundName(node: Node): { readonly name: string; readonly sep: string } | null {
  const parent = node.getParent();
  if (parent?.isKind(SyntaxKind.PropertyAssignment) === true) {
    return { name: parent.getName().replaceAll(/['"]/gu, ""), sep: ":" };
  }
  if (parent?.isKind(SyntaxKind.VariableDeclaration) === true) {
    return { name: parent.getName(), sep: " =" };
  }
  return null;
}

/** Arm I: this numeric literal is a port the registry should have owned, or null. TWO shapes, and the order
 *  matters — a registry VALUE is a respell of a known row (the strongest claim, and it needs no name), while
 *  a port-NAMED position carrying an unknown number is a hand-picked pair. Subscribed by literal KIND, so
 *  every wrapper shape (`as`, parens, an argument position) is caught for free. */
function portLiteral(node: Node): string | null {
  if (!node.isKind(SyntaxKind.NumericLiteral)) {
    return null;
  }
  const text = node.getLiteralText();
  const value = Number(text.replaceAll("_", ""));
  if (REGISTRY_PORTS.has(value)) {
    return text;
  }
  const bound = boundName(node);
  return bound !== null && PORT_NAME_RE.test(bound.name) ? `${bound.name}${bound.sep} ${text}` : null;
}

/** Arm I's adjudication: TRUE when this node was a port literal (reported, or absolved by the registry's own
 *  cited row), so the caller stops. Mirrors judgeClock — the arm's jurisdiction is its own, not scanRoot's. */
function judgePort(node: Node, rel: string, ctx: GateRunCtx): boolean {
  const port = portLiteral(node);
  if (port === null) {
    return false;
  }
  if (rel in PORT_HOME) {
    seenPortHome.add(rel);
    return true;
  }
  ctx.report(node, { token: port, offset: 0 });
  return true;
}

/** Arm J: this node is a fixed wall clock, or null. Three shapes, one rule. */
function fixedClock(node: Node): string | null {
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    const name = node.getName().replaceAll(/['"]/gu, "");
    const init = node.getInitializer();
    return CLOCK_KEYS.has(name) && init?.isKind(SyntaxKind.NumericLiteral) === true ? `${name}: ${init.getText()}` : null;
  }
  if (node.isKind(SyntaxKind.VariableDeclaration)) {
    const name = node.getName();
    const init = node.getInitializer();
    if (!CLOCK_NAME_RE.test(name) || BASE_NAME_RE.test(name) || init === undefined || !init.isKind(SyntaxKind.NumericLiteral)) {
      return null;
    }
    return `${name} = ${init.getText()}`;
  }
  if (!node.isKind(SyntaxKind.CallExpression) || node.getExpression().getText() !== "setTimeout") {
    return null;
  }
  const delay = node.getArguments()[1];
  if (delay === undefined || !delay.isKind(SyntaxKind.NumericLiteral)) {
    return null;
  }
  return Number(delay.getLiteralText().replaceAll("_", "")) >= SETTLE_CEILING_MS ? `setTimeout(…, ${delay.getText()})` : null;
}

/** Arm J's adjudication: TRUE when this node was a wall clock (reported, or absolved by a censused row),
 *  so the caller stops. Extracted from `visit` because the arm is the only one whose jurisdiction spans two
 *  roots and the branch belongs with the detector, not in the dispatch. */
function judgeClock(node: Node, rel: string, ctx: GateRunCtx): boolean {
  const clock = fixedClock(node);
  if (clock === null) {
    return false;
  }
  if (rel in CLOCK_SITES) {
    seenClockSites.add(rel);
    return true;
  }
  ctx.report(node, { token: clock, offset: 0 });
  return true;
}

/** Arm A/B/C/D dispatch: the offending capability's name, or null. */
function capability(node: Node): string | null {
  if (node.isKind(SyntaxKind.NewExpression)) {
    return node.getExpression().getText() === "Project" ? "new Project(" : null;
  }
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return null;
  }
  const callee = node.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    if (callee.getName() === "exit" && callee.getExpression().getText() === "process") {
      return "process.exit(";
    }
    const engine = callee.getExpression().getText();
    if (!LAUNCH_ENGINES.has(engine)) {
      return null;
    }
    // Arm B (launch) and arm H (attach) share the receiver set: a browser type is reached ONE way each.
    return callee.getName() === "launch" || ATTACH_METHODS.has(callee.getName()) ? `${engine}.${callee.getName()}(` : null;
  }
  if (callee.isKind(SyntaxKind.Identifier) && PATH_CALLEES.has(callee.getText())) {
    return reportsPathArg(node, callee.getText());
  }
  return null;
}

/** THE ONE STALE SWEEP for this gate's four path-keyed tables (GATE-AUTHORING §4.4: every exemption
 *  vocabulary is two-sided from birth — a row matching zero live sites must be RED, never silence). The
 *  `seen` set is populated ONLY by a live match during the scan, so BOTH staleness modes collapse into one
 *  test here: the file that stopped violating, and the file that is gone entirely. Callers guard it on the
 *  real-tree ANCHOR, never on a row's own path. */
function staleSweep(ctx: GateRunCtx, table: ExemptionTable, seen: ReadonlySet<string>, message: (key: string, why: string) => string): void {
  for (const [key, row] of Object.entries(table)) {
    if (!seen.has(key)) {
      ctx.report({ file: key, line: 0, column: 0, message: message(key, row.why) });
    }
  }
}

/** Arm J's ROOT-CONFIG half. The two runner configs carry the clocks that cost the most (the CT `mount()`
 *  timeout; the vitest lane timeouts) and no gate's node walk can reach them, so they are read off disk
 *  through the ONE scratch parser. An unreadable config is REPORTED, never skipped: a rename would
 *  otherwise retire the arm in silence, which is the "gate keyed on an exact name detects its own
 *  blindness" rule (GATE-AUTHORING §4.6). Called only past the real-tree anchor. */
function sweepRootConfigs(ctx: GateRunCtx): void {
  for (const rel of ROOT_CONFIGS) {
    const read = readStaticSource(ctx.root, rel);
    if (read.kind !== "ok") {
      // @finding-overload-ok: a BLINDNESS TRIPWIRE with no node to report — the config is unreadable, so there is nothing parsed to anchor on, and a suppressible tripwire would be a way to silence the arm's own retirement. Ends if the root configs join harnessGlobs and the shared walk can see them.
      ctx.report({
        file: rel,
        line: 0,
        column: 0,
        message: `arm J cannot read ${rel} (${read.kind === "missing" ? "not on the tree" : read.detail}) — the CT/vitest wall clocks sit outside harnessGlobs, so this read is the ONLY way any gate sees them. Re-key ROOT_CONFIGS (docs/design/1208-instrument-substrate.md §7.1).`,
      });
      continue;
    }
    const nodes = [...read.sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment), ...read.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)];
    for (const node of nodes) {
      const clock = fixedClock(node);
      if (clock !== null) {
        // @finding-overload-ok: the node lives in the ONE scratch parser (config-static-read), NOT in the shared workspace project, so `ctx.report(node, …)` cannot anchor it to a repo-relative path — the file/line have to be stated. The token is carried, so an `@orb-gate-ignore` can still name its position. Ends if the root configs join harnessGlobs.
        ctx.report({ file: rel, line: node.getStartLineNumber(), column: 1, token: clock });
      }
    }
  }
}

/** Arms A-H + F2 + G's first half — every arm fenced to `tooling/src/**`. Extracted from `visit` when arm I
 *  joined: the dispatch now carries three jurisdictions and inlining all of them exceeded the cognitive-
 *  complexity cap, which is the lint saying the same thing this header does — a jurisdiction per arm. */
function visitToolingArms(node: Node, rel: string, ctx: GateRunCtx): void {
  // Arm G's first half: this file files an artifact, so its TOOL owes a run slot (checked in run()).
  if (node.isKind(SyntaxKind.CallExpression) && ARTIFACT_FILERS.has(node.getExpression().getText()) && toolOf(rel) !== SHARED_DIR) {
    filingTools.set(toolOf(rel), rel);
  }
  // Arm F2: an un-niced spawn door call — legal only for a census'd row.
  if (node.isKind(SyntaxKind.CallExpression) && FULL_PRIORITY_DOORS.has(node.getExpression().getText())) {
    if (rel in FULL_PRIORITY_CALLERS || rel === "tooling/src/_shared/proc.ts") {
      seenFullPriorityCallers.add(rel);
      return;
    }
    ctx.report(node, { token: `${node.getExpression().getText()}(`, offset: 0 });
    return;
  }
  const cap = capability(node) ?? childProcessImport(node);
  if (cap === null) {
    return;
  }
  if (rel in HOMES) {
    seenHomes.add(rel);
    return;
  }
  // Arm A's censused exceptions — a NON-workspace Project, exempt from THIS arm only.
  if (cap === "new Project(" && rel in PROJECT_SITES) {
    seenProjectSites.add(rel);
    return;
  }
  ctx.report(node, { token: cap, offset: 0 });
}

/** Arm I's ROOT-CONFIG half. The playwright configs bind the CT vite port and (through modes.ts) every e2e
 *  stack's pair, and no gate's node walk can reach a repo-root file — so they are DISCOVERED by readdir and
 *  read through the ONE scratch parser, exactly as arm J reads its two. Finding ZERO configs is REPORTED:
 *  the arm is keyed on a name pattern, and a rename that emptied the pattern would retire this half in
 *  silence (GATE-AUTHORING §4.6). Called only past the real-tree anchor, so conformance never reaches it. */
function sweepPlaywrightConfigs(ctx: GateRunCtx): void {
  // The ANCHOR alone is not enough for a READDIR: a conformance example may PLANT the anchor path (the
  // §4.4a mode-B stale proof does exactly that) while `ctx.root` is still a virtual `/repo-N` that no
  // filesystem has, and `readdirSync` on it throws rather than returning nothing. `existsSync` on the root
  // is the §4.5 alternate anchor shape and costs the real tree nothing.
  if (!existsSync(ctx.root)) {
    return;
  }
  const configs = readdirSync(ctx.root).filter((entry) => PLAYWRIGHT_CONFIG_RE.test(entry));
  if (configs.length === 0) {
    // @finding-overload-ok: a BLINDNESS TRIPWIRE with no node to report — nothing was parsed, so there is nothing to anchor on, and a suppressible tripwire would be a way to silence the arm's own retirement. Ends if the playwright configs join harnessGlobs and the shared walk can see them.
    ctx.report({
      file: "playwright.config.ts",
      line: 0,
      column: 0,
      message:
        "arm I found NO playwright*.config.ts at the repo root — the runner configs carry the CT/e2e port surface and sit outside harnessGlobs, so this readdir is the ONLY way any gate sees them. Re-key PLAYWRIGHT_CONFIG_RE (docs/design/1208-instrument-substrate.md §3.6).",
    });
    return;
  }
  for (const rel of configs) {
    const read = readStaticSource(ctx.root, rel);
    if (read.kind !== "ok") {
      // @finding-overload-ok: the same BLINDNESS TRIPWIRE — an unreadable config is announced, never skipped, because a silent skip would retire the arm for that file. Ends with the same harnessGlobs fold-in.
      ctx.report({
        file: rel,
        line: 0,
        column: 0,
        message: `arm I cannot read ${rel} (${read.kind === "missing" ? "not on the tree" : read.detail}) — the runner port surface is unreadable, so this arm is blind to it — every runner port literal has one home at tooling/src/_shared/ports.ts.`,
      });
      continue;
    }
    for (const node of read.sf.getDescendantsOfKind(SyntaxKind.NumericLiteral)) {
      const port = portLiteral(node);
      if (port !== null) {
        // @finding-overload-ok: the node lives in the ONE scratch parser (config-static-read), NOT in the shared workspace project, so `ctx.report(node, …)` cannot anchor it to a repo-relative path — the file/line have to be stated. The token is carried, so an `@orb-gate-ignore` can still name its position. Ends if the root configs join harnessGlobs.
        ctx.report({ file: rel, line: node.getStartLineNumber(), column: 1, token: port });
      }
    }
  }
}

export const gate: GateDescriptor = {
  name: "tooling-shared-plumbing",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.4)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a second home for _shared plumbing — ts-morph Project construction, Playwright launch AND attach (connectOverCDP/connect), reports/<kind> artifact filing, process.exit, and child_process spawning each have ONE sanctioned module (and every tool cli.ts enters through runTool — the exit-honesty runner — and opens a run slot for the artifacts it files); a respell here is the duplication class the tooling package was minted to end (docs/architecture/core/Core-Tooling-Law.md §2.4/§4.4). And every WALL CLOCK is derived from the one load-budget policy (arm J): a fixed ceiling written for a quiet box is a false RED on a contended one, and the fleet carried four unrelated answers to that before #1232. And every TCP PORT is a row in the one registry (arm I): 47 hand-picked literals across tooling, the e2e harness and the runner configs was the state this repo shipped until #1269, which is why picking a pair meant grepping and hoping.",
  fix: "call the _shared home (ts-workspace getWorkspace / browser launchProbeSession or attachProbeSession / artifacts artifactFile inside artifacts withInstrumentRun / run-tool runTool / proc spawnNiced-runNicedSync) instead of respelling it; for a wall clock, name the quiet-box literal `<X>_BASE_MS` and derive the ceiling with `budget(<X>_BASE_MS)` (_shared/load-budget.ts); for a port, read the named row from _shared/ports.ts (DEV_PORTS, FIXTURE_PORTS, E2E_PORTS, CT_VITE_PORT, ENGINE_PORTS, …) — and a NEW port is a new reserved row or a stage band there, never a number picked at the call site.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX) || p.startsWith(TESTS_TOOLING_PREFIX) || p.startsWith(E2E_SUPPORT_PREFIX),
  kinds: [
    SyntaxKind.CallExpression,
    SyntaxKind.NewExpression,
    SyntaxKind.ImportDeclaration,
    SyntaxKind.PropertyAssignment,
    SyntaxKind.VariableDeclaration,
    SyntaxKind.NumericLiteral,
  ],
  begin: () => {
    seenPortHome.clear();
    seenClockSites.clear();
    seenHomes.clear();
    seenFullPriorityCallers.clear();
    seenProjectSites.clear();
    filingTools.clear();
    slottedTools.clear();
  },
  visit: (node, sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null) {
      return;
    }
    // Arm I — a NumericLiteral is no other arm's node kind, so this branch both judges and terminates.
    // Its jurisdiction is tooling/src/** + tests/e2e/support/**; tests/tooling/** is arm J's, not its.
    if (node.isKind(SyntaxKind.NumericLiteral)) {
      if (rel.startsWith(TOOLING_PREFIX) || rel.startsWith(E2E_SUPPORT_PREFIX)) {
        judgePort(node, rel, ctx);
      }
      return;
    }
    // Arm J — tooling/src/** + tests/tooling/**, NOT the e2e support tree (its clocks are e2e boot budgets,
    // #1232's territory). EVERY arm fences its own jurisdiction: riding scanRoot means a widening for one
    // arm silently widens every other, which is the mirror image of the relOf trap above.
    if ((rel.startsWith(TOOLING_PREFIX) || rel.startsWith(TESTS_TOOLING_PREFIX)) && judgeClock(node, rel, ctx)) {
      return;
    }
    // Every arm below is fenced to tooling/src/ — the jurisdiction they had before arm J widened scanRoot.
    if (rel.startsWith(TOOLING_PREFIX)) {
      visitToolingArms(node, rel, ctx);
    }
  },
  // Arm E: every tool cli.ts enters through runTool — the argv front door may not hand-roll its exit.
  visitFile: (sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null || !rel.startsWith(TOOLING_PREFIX) || !CLI_RE.test(rel)) {
      return;
    }
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    // Arm G's second half — recorded for every cli, adjudicated in run() against the filing set.
    if (calls.some((c) => c.getExpression().getText() === "withInstrumentRun")) {
      slottedTools.add(toolOf(rel));
    }
    const importsRunner = sf.getImportDeclarations().some((d) => d.getModuleSpecifierValue().endsWith("_shared/run-tool.ts"));
    const callsRunner = calls.some((c) => c.getExpression().getText() === "runTool");
    if (!(importsRunner && callsRunner)) {
      ctx.report({
        file: rel,
        line: 0,
        column: 0,
        message:
          "a tool cli.ts must enter through runTool (_shared/run-tool.ts) — the exit-honesty runner owns crash≠verdict, pipe-drain and never-downgrade (docs/architecture/core/Core-Tooling-Law.md §4.4).",
      });
    }
  },
  run: (ctx) => {
    // Arm G — BEFORE the anchor guard: it is a cross-file check over whatever corpus ran, not a sweep of
    // this gate's own allowlist rows, so it must adjudicate a conformance mini-project too.
    for (const [tool, site] of filingTools) {
      if (!slottedTools.has(tool)) {
        ctx.report({
          file: `${TOOLING_PREFIX}${tool}/cli.ts`,
          line: 0,
          column: 0,
          message: `${site} files an artifact, so ${tool}'s cli.ts must open its artifact run slot (withInstrumentRun, _shared/artifacts.ts) — an unslotted instrument writes into the shared reports/<kind>/ where a concurrent run of the same instrument destroys its artifacts (#1164; docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md §3.3b).`,
        });
      }
    }
    // The two-sided sweep, anchored on the real tree (never a row's own path — GATE-AUTHORING §4.5).
    if (!fileLoaded(ctx, ANCHOR)) {
      return;
    }
    // Arm J's root-config half. `missing` is silent BY DESIGN only past the anchor: on a real tree the
    // anchor proves this is the repo, so a config that vanished is a rename the arm must announce rather
    // than a file it may skip — the "gate keyed on an exact name detects its own blindness" rule.
    sweepRootConfigs(ctx);
    // Arm I's root-config half, same placement and same reason: past the anchor, so a conformance
    // mini-project never readdirs the real repo root.
    sweepPlaywrightConfigs(ctx);
    staleSweep(
      ctx,
      PORT_HOME,
      seenPortHome,
      (key, why) =>
        `stale PORT_HOME row — "${key}" no longer carries a port literal (row why: ${why}). Either the registry moved (re-key the row) or it stopped declaring ports, in which case arm I is judging against nothing (docs/design/1208-instrument-substrate.md §3.6).`,
    );
    staleSweep(
      ctx,
      CLOCK_SITES,
      seenClockSites,
      (key, why) =>
        `stale CLOCK_SITES row — "${key}" no longer carries a fixed wall clock (row why: ${why}). Delete the row; this census is shrink-only (docs/design/1208-instrument-substrate.md §7.1).`,
    );
    staleSweep(
      ctx,
      HOMES,
      seenHomes,
      (key, why) =>
        `stale HOMES row — "${key}" no longer carries its capability (row why: ${why}). Re-key or delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
    );
    staleSweep(
      ctx,
      PROJECT_SITES,
      seenProjectSites,
      (key, why) =>
        `stale PROJECT_SITES row — "${key}" no longer constructs a ts-morph Project (row why: ${why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
    );
    staleSweep(
      ctx,
      FULL_PRIORITY_CALLERS,
      seenFullPriorityCallers,
      (key, why) =>
        `stale FULL_PRIORITY_CALLERS row — "${key}" no longer calls a full-priority door (row why: ${why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
    );
  },
  mustFlag: [
    {
      files: 'import { Project } from "ts-morph";\nexport const p = new Project({});\n',
      at: "tooling/src/ast/ops/load.ts",
      expect: { count: 1, token: "new Project(" },
      why: "a second ts-morph loader — the fourth `new Project(` site the one-loader rule exists to prevent",
    },
    {
      files: 'import { spawn } from "node:child_process";\nexport const s = spawn;\n',
      at: "tooling/src/verify/lib/comment-spans.ts",
      expect: { count: 1, token: 'import "node:child_process"' },
      why: "a PROJECT_SITES row is arm-A exempt ONLY — the same file spawning a child is still RED (the row is not a blanket pass)",
    },
    {
      files: 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\n',
      at: "tooling/src/snap/ops/capture.ts",
      expect: { count: 1, token: "chromium.launch(" },
      why: "a second Playwright bootstrap outside _shared/browser.ts",
    },
    {
      files: 'import { join } from "node:path";\nexport const d = join("/root", "reports", "snaps");\n',
      at: "tooling/src/snap/ops/out.ts",
      expect: { count: 1 },
      why: "a hand-rolled reports/<kind> path outside _shared/artifacts.ts — the artifact-dir respell",
    },
    {
      files: 'import { chromium } from "@playwright/test";\nexport const b = chromium.connectOverCDP("http://127.0.0.1:9222");\n',
      at: "tooling/src/ui-audit/ops/run.ts",
      expect: { count: 1, token: "chromium.connectOverCDP(" },
      why: "a second CDP attach outside _shared/browser.ts — a sibling instrument reaching a session daemon's browser around attachProbeSession (arm H; docs/design/1208-instrument-substrate.md §3.4)",
    },
    {
      files: 'import { chromium } from "@playwright/test";\nexport const b = chromium.connect("ws://127.0.0.1:9222/x");\n',
      at: "tooling/src/motion-audit/ops/run.ts",
      expect: { count: 1, token: "chromium.connect(" },
      why: "Playwright's websocket attach is the SAME door class — the design's refused alternative must not be a loophole (arm H matches the attach SET)",
    },
    {
      files: "export function bail(): never {\n  process.exit(2);\n}\n",
      at: "tooling/src/ast/ops/bail.ts",
      expect: { count: 1, token: "process.exit(" },
      why: "a bare process.exit outside run-tool — drops the pipe and dodges the exit-honesty runner (arm D)",
    },
    {
      files: 'import { spawn } from "node:child_process";\nexport const s = spawn;\n',
      at: "tooling/src/seed/ops/raw.ts",
      expect: { count: 1, token: 'import "node:child_process"' },
      why: "a direct child_process import outside proc.ts — bypasses the nice -19 homelab floor (arm F)",
    },
    {
      files: 'declare function spawnFullPrioritySync(c: string, a: string[]): void;\nexport const x = (): void => spawnFullPrioritySync("x", []);\n',
      at: "tooling/src/seed/ops/hot.ts",
      expect: { count: 1, token: "spawnFullPrioritySync(" },
      why: "an un-census'd full-priority spawn — the exception is allowlisted by row, never ambient (arm F2)",
    },
    {
      files: 'declare function spawnFullPriorityChild(c: string, a: string[]): void;\nexport const x = (): void => spawnFullPriorityChild("x", []);\n',
      at: "tooling/src/seed/ops/warm.ts",
      expect: { count: 1, token: "spawnFullPriorityChild(" },
      why: "the DETACHED full-priority door is censused identically — a second door must not be a second loophole (arm F2)",
    },
    {
      files: { "tooling/src/badcli/cli.ts": "export const c = 1;\n" },
      expect: { messageIncludes: "must enter through runTool" },
      why: "a tool cli.ts that never enters the exit-honesty runner (arm E)",
    },
    {
      files: {
        "tooling/src/unslotted/cli.ts": 'import { runTool } from "../_shared/run-tool.ts";\nimport { shoot } from "./ops/shoot.ts";\nawait runTool(shoot);\n',
        "tooling/src/unslotted/ops/shoot.ts":
          'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
        "tooling/src/_shared/run-tool.ts": "export function runTool(main: () => number): Promise<void> {\n  return Promise.resolve(void main());\n}\n",
      },
      expect: { messageIncludes: "must open its artifact run slot" },
      why: "an instrument that files artifacts with no run slot — the #1164 shared-path clobber (arm G)",
    },
    {
      files: "export const p = 8788;\n",
      at: "tooling/src/stack/ops/up.ts",
      expect: { count: 1, token: "8788" },
      why: "a RESERVED registry port respelled as a literal — the dev pair was the exact respell #1271 spent (stage-plan.ts + fixture.ts held four of them) (arm I)",
    },
    {
      files: "export const stage = { server: 8888, vite: 5273 };\n",
      at: "tooling/src/snap/lib/stage-plan.ts",
      expect: { count: 2, token: "8888" },
      why: "the STAGE-BAND half: bands are allocated, never typed — the arm imports STAGE_BAND_PORT_NUMBERS, so band 0's pair is as much a respell as a reserved row, and BOTH sides report (arm I)",
    },
    {
      files: 'export const mode = { name: "local", port: 8796 };\n',
      at: "tests/e2e/support/modes.ts",
      expect: { count: 1, token: "8796" },
      why: "the proof arm I's jurisdiction REACHES tests/e2e/support/** — the root arm J does not judge, and the exact class of file where a widened scanRoot with an un-widened relOf reads GREEN over files it never opened (2026-09-02)",
    },
    {
      files: "const FIXTURE_PORT = 8123;\nexport const x = FIXTURE_PORT;\n",
      at: "tooling/src/stack/lib/spawners.ts",
      expect: { count: 1, token: "FIXTURE_PORT = 8123" },
      why: "a HAND-PICKED NEW port: no registry row declares 8123, so only the NAME gives it away — this is pain P10 verbatim (picking a pair by grepping and hoping) and the value-shaped half is structurally blind to it (arm I)",
    },
    {
      files: "export const opts = { ctPort: 3101 };\n",
      at: "tooling/src/snap/ops/capture.ts",
      expect: { count: 1, token: "ctPort: 3101" },
      why: "the PROPERTY spelling of the same dodge — a port-named object key is as much a declaration as a const, and CT's own port sits one below it (arm I)",
    },
    {
      files: { "tooling/src/_shared/exit-contract.ts": "export const EXIT_OK = 0;\n" },
      expect: { messageIncludes: "stale PORT_HOME row" },
      why: "GATE-AUTHORING §4.4a mode (B): the real-tree ANCHOR is loaded but the PORT_HOME row's file is GONE — a path-keyed exemption whose file vanished must RED, not rot silently (the row is never visited, so a seen-set is the only test that catches it)",
    },
    {
      files: "export const opts = { timeout: 30_000 };\n",
      at: "tooling/src/ui-audit/ops/walk.ts",
      expect: { count: 1, token: "timeout: 30_000" },
      why: "a fixed wall clock at a timeout option — the false-red-under-load class arm J exists to end (arm J)",
    },
    {
      files: "const STEP_TIMEOUT_MS = 5000;\nexport const x = STEP_TIMEOUT_MS;\n",
      at: "tests/tooling/ui-audit/cli.int.test.ts",
      expect: { count: 1, token: "STEP_TIMEOUT_MS = 5000" },
      why: "the NAMED-CONST dodge — a literal moved one line up is still a fixed clock — AND the proof arm J's jurisdiction reaches tests/tooling/**, which no other arm judges (arm J)",
    },
    {
      files: "export const wait = (): void => {\n  setTimeout(() => undefined, 30_000);\n};\n",
      at: "tooling/src/motion-audit/ops/drive.ts",
      expect: { count: 1, token: "setTimeout(…, 30_000)" },
      why: "a ceiling wearing a sleep's clothes: a setTimeout at or above the settle ceiling is a budget (arm J)",
    },
  ],
  mustPass: [
    {
      files: "export const DEV_PORTS = { server: 8788, vite: 5173 };\n",
      at: "tooling/src/_shared/ports.ts",
      why: "THE registry, scanned AND allowlisted by its cited PORT_HOME row — the scan-and-allowlist shape (never a scanRoot exclusion), so the day it moves it reds at its new path (arm I's pass half)",
    },
    {
      files: 'import { DEV_PORTS } from "../../_shared/ports.ts";\nexport const staged = DEV_PORTS.server + 100;\n',
      at: "tooling/src/snap/lib/stage-plan.ts",
      why: "the SANCTIONED shape and the literal #1271 landing: the pair is READ from the registry and the offset is an ordinary number no port table declares — flagging this would leave no legal way to derive a port (arm I)",
    },
    {
      files: 'export const dev = { name: "single-user", baseUrl: "http://localhost:5173" };\n',
      at: "tests/e2e/support/target-guard.test.ts",
      why: "DECLARED LIMIT: a port inside a STRING is not a numeric literal. The target guard spells the dev origins as negative FIXTURE data — the thing it refuses — and widening the arm to string content would either accuse it or need an allowlist row for a test's own subject (arm I)",
    },
    {
      files: "export const model = { contextWindow: 8192, maxTokens: 4096 };\n",
      at: "tests/e2e/support/actors.ts",
      why: "the FALSE-POSITIVE control: 8192 is a real four-digit number at a non-port key, live in actors.ts today. The name half needs a PORT-shaped name and the value half needs a number the registry actually declares — 'any four-digit literal' would accuse every context window in the harness (arm I). DECLARED LIMIT, the other way: a registry number reused with a NON-port meaning IS flagged, deliberately — a respell is a respell and the escape is a positioned @orb-gate-ignore, not a looser matcher",
    },
    {
      files: "export const budgets = { timeout: budget(NAV_BASE_MS) };\ndeclare function budget(n: number): number;\ndeclare const NAV_BASE_MS: number;\n",
      at: "tooling/src/ui-audit/lib/budgets.ts",
      why: "the SANCTIONED wall-clock shape — a derived ceiling, not a literal (arm J's pass half)",
    },
    {
      files: "const NAV_TIMEOUT_BASE_MS = 15_000;\nexport const x = NAV_TIMEOUT_BASE_MS;\n",
      at: "tooling/src/motion-audit/lib/budgets.ts",
      why: "a quiet-box BASE declares itself in its NAME and is the literal every budget is derived from — flagging it would leave no legal way to state a base (arm J)",
    },
    {
      files: "export const settle = (): void => {\n  setTimeout(() => undefined, 400);\n};\n",
      at: "tooling/src/snap/ops/drive.ts",
      why: "a SETTLE is a sleep the run always pays, not a ceiling — settles are never scaled (§7.1), so a short setTimeout must not trip the arm",
    },
    {
      files: "export const opts = { timeout: 5000 };\n",
      at: "tests/tooling/verify/ops/structure.int.test.ts",
      why: "a CENSUSED CLOCK_SITES row (the deliberate SHORT kill whose assertion IS `timedOut === true`) — absolved by cited row, never ambient. Re-pointed here by #1266: this fixture used to cite snap/lib/budgets.ts, whose row was SPENT when snap's ceilings went through budget(), and a mustPass proof may only cite a row that still exists",
    },
    {
      files: 'import { Project } from "ts-morph";\nexport const p = new Project({});\n',
      at: "tooling/src/_shared/ts-workspace.ts",
      why: "the sanctioned loader home — scanned AND allowlisted (scan-and-allowlist, not scanRoot-excluded)",
    },
    {
      files: 'import { Project } from "ts-morph";\nexport const p = new Project({ useInMemoryFileSystem: true });\n',
      at: "tooling/src/verify/lib/comment-spans.ts",
      why: "a censused PROJECT_SITES row — a NON-workspace Project (an in-memory scratch parser) is arm-A exempt by cited row",
    },
    {
      files: {
        "tooling/src/goodcli/cli.ts": 'import { runTool } from "../_shared/run-tool.ts";\nawait runTool(() => 0);\n',
        "tooling/src/_shared/run-tool.ts": "export function runTool(main: () => number): Promise<void> {\n  return Promise.resolve(void main());\n}\n",
      },
      why: "a cli.ts entering through runTool — the sanctioned front-door shape (arm E's pass half)",
    },
    {
      files: 'export const help = "artifacts land under reports/snaps/";\n',
      at: "tooling/src/snap/ops/help.ts",
      why: "the literal in PROSE (not a path-call argument) — help text must not trip the respell arm",
    },
    {
      files: 'import { chromium } from "@playwright/test";\nexport const b = chromium.connectOverCDP("http://127.0.0.1:9222");\n',
      at: "tooling/src/_shared/browser.ts",
      why: "the sanctioned attach home (attachProbeSession) — scanned AND allowlisted, the scan-and-allowlist shape arm B already uses for launch (arm H's pass half)",
    },
    {
      files: 'import puppeteer from "puppeteer-core";\nexport const b = puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });\n',
      at: "tooling/src/snap/ops/arms/lighthouse.ts",
      why: "THE DECLARED LIMIT: puppeteer's `connect` is the Lighthouse engine's own page seam (the #1226 spike measured that snapshot mode needs the puppeteer handle) and is not a Playwright browser type — arm H keys on the engine RECEIVERS; the puppeteer door is phase 3's to place",
    },
    {
      files: {
        "tooling/src/slotted/cli.ts":
          'import { withInstrumentRun } from "../_shared/artifact-out.ts";\nimport { runTool } from "../_shared/run-tool.ts";\nimport { shoot } from "./ops/shoot.ts";\nawait runTool(async () => await withInstrumentRun("slotted", shoot));\n',
        "tooling/src/slotted/ops/shoot.ts":
          'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
        "tooling/src/_shared/run-tool.ts": "export function runTool(main: () => number): Promise<void> {\n  return Promise.resolve(void main());\n}\n",
      },
      why: "the sanctioned instrument shape — files artifacts INSIDE a run slot (arm G's pass half)",
    },
  ],
};
