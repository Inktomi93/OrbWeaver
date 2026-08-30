// Gate: tooling-shared-plumbing (docs/architecture/core/Core-Tooling-Law.md §4.4) — ONE home per plumbing capability.
// Arms: (A) ts-morph `new Project(` outside _shared/ts-workspace.ts; (B) playwright `<engine>.launch(`
// outside _shared/browser.ts; (C) a "reports"/"reports/…" literal fed to join/resolve/mkdir/mkdirSync
// outside _shared/artifacts.ts; (D) `process.exit(` outside _shared/run-tool.ts (a bare exit drops the
// pipe AND dodges the exit-honesty runner); (E) a tool cli.ts that does not enter through runTool;
// (F) a `node:child_process` import outside _shared/proc.ts (a direct spawn bypasses the nice -19
// homelab floor), with full-priority-door callers allowlisted in FULL_PRIORITY_CALLERS and the
// NON-WORKSPACE ts-morph constructions censused in PROJECT_SITES.
// Scan-and-allowlist: the HOMES are SCANNED and carried as cited rows with a stale sweep (GATE-AUTHORING §4). Comment posture: comment-SAFE (node kinds + literal args).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const TOOLING_PREFIX = "tooling/src/";
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
    why: "ONE scratch parser (`useInMemoryFileSystem`) for the repo-ROOT code configs — eslint.config.js and .dependency-cruiser.cjs. They are genuinely outside the shared workspace (harnessGlobs covers packages/*/src, tests/ and tooling/src/, never a root .js/.cjs), so getWorkspace() structurally cannot serve them, and the two liveness gates that read them would otherwise each construct their own. Ends if the root configs ever join harnessGlobs.",
  },
  "tooling/src/verify/gates/enforcement-registry-parity.ts": {
    why: "fsBacked, same reason as dangling-refs: it reconciles the on-disk gate corpus against the enforcement doc, and a conformance temp tree has no shared workspace to read from. Ends on the same diagnostic-legibility-style fold-in.",
  },
};

const PATH_CALLEES = new Set(["join", "resolve", "mkdir", "mkdirSync"]);
const LAUNCH_ENGINES = new Set(["chromium", "firefox", "webkit"]);

const seenHomes = new Set<string>();
const seenFullPriorityCallers = new Set<string>();
const seenProjectSites = new Set<string>();
const CLI_RE = /^tooling\/src\/[^/]+\/cli\.ts$/u;

function relOf(abs: string): string | null {
  const norm = abs.replace(/\\/gu, "/");
  const i = norm.indexOf(`/${TOOLING_PREFIX}`);
  return i === -1 ? null : norm.slice(i + 1);
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
    return callee.getName() === "launch" && LAUNCH_ENGINES.has(engine) ? `${engine}.launch(` : null;
  }
  if (callee.isKind(SyntaxKind.Identifier) && PATH_CALLEES.has(callee.getText())) {
    return reportsPathArg(node, callee.getText());
  }
  return null;
}

export const gate: GateDescriptor = {
  name: "tooling-shared-plumbing",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.4)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a second home for _shared plumbing — ts-morph Project construction, Playwright launch, reports/<kind> artifact filing, process.exit, and child_process spawning each have ONE sanctioned module (and every tool cli.ts enters through runTool — the exit-honesty runner); a respell here is the duplication class the tooling package was minted to end (docs/architecture/core/Core-Tooling-Law.md §2.4/§4.4).",
  fix: "call the _shared home (ts-workspace getWorkspace / browser launchProbeSession / artifacts artifactFile / run-tool runTool / proc spawnNiced-runNicedSync) instead of respelling it.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.ImportDeclaration],
  begin: () => {
    seenHomes.clear();
    seenFullPriorityCallers.clear();
    seenProjectSites.clear();
  },
  visit: (node, sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null) {
      return;
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
  },
  // Arm E: every tool cli.ts enters through runTool — the argv front door may not hand-roll its exit.
  visitFile: (sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null || !CLI_RE.test(rel)) {
      return;
    }
    const importsRunner = sf.getImportDeclarations().some((d) => d.getModuleSpecifierValue().endsWith("_shared/run-tool.ts"));
    const callsRunner = sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => c.getExpression().getText() === "runTool");
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
    // The two-sided sweep, anchored on the real tree (never a row's own path — GATE-AUTHORING §4.5).
    if (!fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const [home, row] of Object.entries(HOMES)) {
      if (!seenHomes.has(home)) {
        ctx.report({
          file: home,
          line: 0,
          column: 0,
          message: `stale HOMES row — "${home}" no longer carries its capability (row why: ${row.why}). Re-key or delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
        });
      }
    }
    for (const [site, row] of Object.entries(PROJECT_SITES)) {
      if (!seenProjectSites.has(site)) {
        ctx.report({
          file: site,
          line: 0,
          column: 0,
          message: `stale PROJECT_SITES row — "${site}" no longer constructs a ts-morph Project (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
        });
      }
    }
    for (const [caller, row] of Object.entries(FULL_PRIORITY_CALLERS)) {
      if (!seenFullPriorityCallers.has(caller)) {
        ctx.report({
          file: caller,
          line: 0,
          column: 0,
          message: `stale FULL_PRIORITY_CALLERS row — "${caller}" no longer calls a full-priority door (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.4).`,
        });
      }
    }
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
  ],
  mustPass: [
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
  ],
};
