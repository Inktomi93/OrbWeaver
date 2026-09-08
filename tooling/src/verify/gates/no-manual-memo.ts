// Gate: no-manual-memo — the React Compiler runs full-compile on this tree (D54), so a hand-written
// `useMemo`/`useCallback`/`memo` is memoization the compiler already did: dead weight that also re-arms a
// dependency array every render and drags effects into the biome dep-rule deadlock the burn-down paid for.
// ARMS: (a) an ImportSpecifier named useMemo/useCallback/memo from "react" (keyed on the NAME, so an alias
// still reds) · (b) a `React.useMemo`/`React.useCallback`/`React.memo` member call.
// DECLARED LIMIT: a BARE call with no react import is invisible — the import is the only door (mustPass row).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";

const BANNED_NAMES = new Set(["useMemo", "useCallback", "memo"]);
const BANNED_MEMBERS = new Set(["React.useMemo", "React.useCallback", "React.memo"]);
const REACT_SPECIFIER = "react";

// The stale arm's REAL-TREE ANCHOR: present on every real run, never materialized by an example that also
// carries an exemption path (GATE-AUTHORING.md §4.5).
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const GATE_SELF = "tooling/src/verify/gates/no-manual-memo.ts";

// The React Compiler's own hook denylist, read off the installed plugin (pnpm keeps it under the CLIENT
// package, not the hoisted root — the root path does not resolve). `@tanstack/react-virtual`'s
// `useVirtualizer` is marked `knownIncompatible` there, which is WHY the two virtualized primitives below
// still hand-memoize. When that string leaves the bundle the two seal rows are deletable — see the tripwire.
const COMPILER_DIST_REL = "packages/client/node_modules/babel-plugin-react-compiler/dist/index.js";
const COMPILER_DENYLIST_TOKEN = "@tanstack/react-virtual";

/** Files where manual memoization is the only correct answer. Both-ways: a row whose file stops carrying a
 *  manual-memo hit is RED (delete the row). */
const EXEMPTIONS: ExemptionTable = {
  "packages/ui/src/primitives/message-list/message-list.tsx": {
    why:
      "the React Compiler DENYLISTS `@tanstack/react-virtual` (`useVirtualizer` is `knownIncompatible` in " +
      "packages/client/node_modules/babel-plugin-react-compiler/dist/index.js), so this component is skipped by the " +
      "compiler entirely and manual memo is the ONLY memoization it can get. ENDS the day the Compiler delists " +
      "react-virtual — the tripwire in this gate's finalize reds when that token leaves the plugin bundle.",
  },
  "packages/ui/src/primitives/media-grid/media-grid.tsx": {
    why:
      "same denylist as message-list.tsx — this grid is a `useVirtualizer` component, so the Compiler skips it and " +
      "its `useMemo` is real work, not redundancy. ENDS on the same tripwire (the react-virtual delisting).",
  },
  "packages/ui/src/fuzzy-search/fuzzy-search.ts": {
    why:
      "measured design, not habit: the minisearch index is cached on VALUE-keyed deps because the call sites pass " +
      "inline field-array literals (fresh refs every render) — reference-keyed deps would rebuild the whole index " +
      "per keystroke, the neo hotspot this file's own header names. The Compiler memoizes by REFERENCE and cannot " +
      "express that. ENDS if the options API is changed to require hoisted/stable option objects, or if the " +
      "Compiler learns value-keyed deps.",
  },
};

const MESSAGE =
  "manual memoization (`useMemo` / `useCallback` / `memo`) in compiled client code — the React Compiler runs " +
  "full-compile on this tree (Core-Path-Registry.md D54), so it already memoizes every component and hook it " +
  "compiles. A hand-written memo is redundant work that additionally re-arms a dependency array every render, " +
  "which is what drags biome's exhaustive-deps rules into the deadlock this ban was minted from.";

const FIX =
  "Delete the memo — the Compiler memoizes compiled files. If biome's dep rules deadlock on a plain in-component " +
  "function used as an effect dep, hoist it to module scope and thread values/refs as params (see " +
  "packages/client/src/features/app-shell/surfaces/app-shell.tsx `dismissOverlays` and " +
  "packages/client/src/forms/editor/create-autosave-entity-form.tsx `takeDiscard`). Manual memo survives ONLY where the " +
  "Compiler cannot compile the component at all (its `@tanstack/react-virtual` denylist) or where the deps are " +
  "VALUE-keyed by design — both take a cited EXEMPTIONS row in tooling/src/verify/gates/no-manual-memo.ts.";

const STALE_ROW_PREFIX =
  "EXEMPTIONS row matching NO manual-memo site any more (the memo was deleted, or the file moved/was renamed) — " +
  "a stale row is a loaded gun that pre-authorizes the next memo written there; delete it in " +
  "tooling/src/verify/gates/no-manual-memo.ts: ";

const DELISTED_MESSAGE =
  `the React Compiler no longer denylists \`${COMPILER_DENYLIST_TOKEN}\` (${COMPILER_DIST_REL} does not contain the ` +
  "token any more), so `useVirtualizer` components are compiled and memoized like everything else. The END CONDITION " +
  "written into the two seal rows has arrived: delete the message-list + media-grid rows in " +
  "tooling/src/verify/gates/no-manual-memo.ts and the 3 manual-memo sites they cover (packages/ui/src/primitives/" +
  "message-list/message-list.tsx, packages/ui/src/primitives/media-grid/media-grid.tsx).";

/** Exemption paths that produced an exempted hit this run — the stale arm's truth set. */
const seen = new Set<string>();

/** Is this ImportSpecifier a banned name imported from "react"? Keyed on the IMPORTED name, so
 *  `useMemo as um` still reds; an alias buys nothing. */
function isBannedReactImport(node: Node): boolean {
  if (!(Node.isImportSpecifier(node) && BANNED_NAMES.has(node.getName()))) {
    return false;
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl?.getModuleSpecifierValue() === REACT_SPECIFIER;
}

/** `React.useMemo(…)` / `React.useCallback(…)` / `React.memo(…)` — the namespace spelling. */
function isBannedMemberCall(node: Node): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const expr = node.getExpression();
  return Node.isPropertyAccessExpression(expr) && BANNED_MEMBERS.has(expr.getText());
}

export const gate: GateDescriptor = {
  name: "no-manual-memo",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Core-Path-Registry.md D54",
  status: "active",
  scopeSafety: "incremental-safe", // per-file verdicts; the stale + tripwire arms self-guard in finalize
  fsBacked: true, // the denylist tripwire reads the installed compiler plugin off disk
  message: MESSAGE,
  fix: FIX,
  // Sanctioned homes are SCANNED, not scoped out: the only exemption is a cited row, so a moved file reds at
  // its new path instead of carrying its exemption along (GATE-AUTHORING.md §3).
  scanRoot: (p) => p.startsWith("packages/ui/src/") || p.startsWith("packages/client/src/") || p.startsWith("tests/ui/") || p.startsWith("tests/client/"),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],

  begin: () => {
    seen.clear();
  },

  visit: (node, sf, ctx) => {
    if (!(isBannedReactImport(node) || isBannedMemberCall(node))) {
      return;
    }
    const rel = repoRel(ctx.root, sf.getFilePath());
    if (rel in EXEMPTIONS) {
      seen.add(rel);
      return;
    }
    ctx.report(node);
  },

  finalize: (ctx) => {
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return; // not the real tree — a stale claim here would judge a synthetic fileset
    }
    // UNCONDITIONAL: this single check covers BOTH staleness modes — the file survived but no longer memoizes,
    // AND the file is gone entirely (never visited, so never in `seen`). Gating a row on its OWN file being
    // loaded is the anti-pattern that silences mode (B) (GATE-AUTHORING.md §4a).
    for (const rel of Object.keys(EXEMPTIONS)) {
      if (!seen.has(rel)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_ROW_PREFIX + rel });
      }
    }
    const dist = join(ctx.root, COMPILER_DIST_REL);
    if (existsSync(dist) && !readFileSync(dist, "utf8").includes(COMPILER_DENYLIST_TOKEN)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: DELISTED_MESSAGE });
    }
  },

  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/components/x.tsx": 'import { useMemo } from "react";\nexport const v = useMemo(() => 1, []);\n',
      },
      expect: { count: 1, messageIncludes: "React Compiler runs" },
      why: "the founding shape — a plain `useMemo` imported from react and called in a compiled feature (the import is the door; the bare call rides along)",
    },
    {
      files: {
        "packages/client/src/features/x/components/x.tsx": 'import { useMemo as um } from "react";\nexport const v = um(() => 1, []);\n',
      },
      expect: { count: 1 },
      why: "an ALIASED import still reds — the arm keys on the IMPORTED name, not the local binding, so renaming the door does not open it",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": 'import { memo } from "react";\nexport const C = memo(() => null);\n',
      },
      expect: { count: 1 },
      why: "`memo` is the component-level spelling of the same redundancy — the Compiler already memoizes the component it compiles",
    },
    {
      files: {
        "packages/client/src/features/x/components/x.tsx": 'import React from "react";\nexport const v = React.useCallback(() => 1, []);\n',
      },
      expect: { count: 1 },
      why: "the MEMBER arm — a default/namespace React import has no ImportSpecifier at all, so the call site is the only door for `React.useCallback`",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const schemaBarrel = 1;\n",
      },
      expect: { count: 3, messageIncludes: "stale row" },
      why: "STALENESS MODE (B) — the real-tree anchor is loaded but NONE of the exemption files exist, so all three rows name nothing and every one reds. A row whose staleness were gated on its OWN file being loaded would be silent here, forever",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/components/x.tsx": 'import { memo } from "./local-memo";\nexport const v = memo(1);\n',
      },
      why: '`memo` imported from a NON-react module is somebody else\'s function — the arm requires the module specifier to be exactly "react"',
    },
    {
      files: {
        "packages/client/src/features/x/components/x.tsx":
          'import { useShallow } from "zustand/react/shallow";\nexport const sel = useShallow((s: { a: number }) => s.a);\n',
      },
      why: "`useShallow` is the SANCTIONED zustand selector-stability tool (D54) — it is not React memoization and must never be caught in the sweep",
    },
    {
      files: {
        "packages/client/src/features/x/components/x.tsx":
          "function useCallback(fn: () => void): void {\n  fn();\n}\nexport const v = useCallback(() => undefined);\n",
      },
      why: "DECLARED LIMIT, written down rather than assumed: a BARE local function named `useCallback` is not flagged — the react import is the only door this gate watches, the same blind-spot class as brand-in-name-position's alias limit. A green here means 'no manual memo entered through the react import', not 'none exists'",
    },
    {
      files: {
        "packages/ui/src/primitives/message-list/message-list.tsx": 'import { useCallback } from "react";\nexport const v = useCallback(() => 1, []);\n',
      },
      why: "an EXEMPTED path — the Compiler denylists `@tanstack/react-virtual`, so this seal's manual memo is the only memoization it can have (and the finalize tripwire reds the day that stops being true)",
    },
  ],
};
