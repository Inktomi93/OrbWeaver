// Gate: tooling-shared-plumbing (docs/design/tooling-package.md §4.4) — ONE home per plumbing capability.
// Arms: (A) a ts-morph `new Project(` outside _shared/ts-workspace.ts; (B) a playwright `<engine>.launch(`
// outside _shared/browser.ts; (C) a "reports"/"reports/…" string literal fed to join/resolve/mkdir/mkdirSync
// outside _shared/artifacts.ts (the artifact-dir respell — the exact duplication class the program was
// minted from). Scan-and-allowlist: the HOMES are SCANNED and carried as cited rows with a stale sweep (GATE-AUTHORING §4). Comment posture: comment-SAFE (node kinds + literal args).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { ExemptionTable, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const TOOLING_PREFIX = "tooling/src/";
const ANCHOR = "tooling/src/_shared/exit-contract.ts";

/** capability → its ONE sanctioned home (repo-relative). The stale sweep reds a row whose home was never
 *  seen carrying its capability on a real-tree run — a moved home must go RED at its new path, never
 *  silently keep its exemption (GATE-AUTHORING §4.4a). */
const HOMES: ExemptionTable & Readonly<Record<string, { readonly why: string }>> = {
  "tooling/src/_shared/ts-workspace.ts": { why: "the ONE ts-morph loader (getWorkspace) — ends only if the loader itself moves, which re-keys this row" },
  "tooling/src/_shared/browser.ts": { why: "the ONE Playwright bootstrap (launchProbeSession) — same end condition" },
  "tooling/src/_shared/artifacts.ts": { why: "the ONE reports/<kind> artifact filer — same end condition" },
};

const PATH_CALLEES = new Set(["join", "resolve", "mkdir", "mkdirSync"]);
const LAUNCH_ENGINES = new Set(["chromium", "firefox", "webkit"]);

const seenHomes = new Set<string>();

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

/** Arm A/B/C dispatch: the offending capability's name, or null. */
function capability(node: Node): string | null {
  if (node.isKind(SyntaxKind.NewExpression)) {
    return node.getExpression().getText() === "Project" ? "new Project(" : null;
  }
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return null;
  }
  const callee = node.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
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
  docRow: "Core-Enforcement-Active-Gates.md (docs/design/tooling-package.md §4.4)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a second home for _shared plumbing — ts-morph Project construction, Playwright launch, and reports/<kind> artifact filing each have ONE sanctioned module; a respell here is the duplication class the tooling package was minted to end (docs/design/tooling-package.md §2.4/§4.4).",
  fix: "call the _shared home (ts-workspace getWorkspace / browser launchProbeSession / artifacts artifactFile) instead of respelling it.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression],
  begin: () => {
    seenHomes.clear();
  },
  visit: (node, sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null) {
      return;
    }
    const cap = capability(node);
    if (cap === null) {
      return;
    }
    if (rel in HOMES) {
      seenHomes.add(rel);
      return;
    }
    ctx.report(node, { token: cap, offset: 0 });
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
          message: `stale HOMES row — "${home}" no longer carries its capability (row why: ${row.why}). Re-key or delete the row (docs/design/tooling-package.md §4.4).`,
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
  ],
  mustPass: [
    {
      files: 'import { Project } from "ts-morph";\nexport const p = new Project({});\n',
      at: "tooling/src/_shared/ts-workspace.ts",
      why: "the sanctioned loader home — scanned AND allowlisted (scan-and-allowlist, not scanRoot-excluded)",
    },
    {
      files: 'export const help = "artifacts land under reports/snaps/";\n',
      at: "tooling/src/snap/ops/help.ts",
      why: "the literal in PROSE (not a path-call argument) — help text must not trip the respell arm",
    },
  ],
};
