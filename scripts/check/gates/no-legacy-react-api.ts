// Gate: no-legacy-react-api — the pre-hooks React surface (class components, element cloning, string-ref
// era helpers) is legacy in React 19; every one of these has a modern equivalent and keeping them alive
// splits one idiom into two. FOUR ARMS: (1) a react ImportSpecifier named cloneElement/createRef/Children/
// PureComponent · (2) the `React.`-qualified member spellings incl. `React.Children.*` · (3) a class
// extending Component/PureComponent that is NOT an error boundary · (4) useFormState/flushSync from react-dom.
// The ONE carve-out is structural (componentDidCatch / static getDerivedStateFromError) — error boundaries
// have no hook form and stay classes. Site-level escape: the house `@orb-gate-` + `ignore` marker naming this
// gate, which is TWO-SIDED (a marker guarding no live violation is RED). DECLARED LIMIT: `Component` itself is
// NOT flagged — the error boundaries import it legitimately, so arm 3 judges the class, not the import.
import type { ClassDeclaration, Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { repoRel } from "../pass.ts";

const REACT_SPECIFIER = "react";
const REACT_DOM_SPECIFIER = "react-dom";
// `Component` is deliberately ABSENT: the sanctioned error boundaries import it as a value, and arm 3 judges
// the CLASS instead (structurally, on its boundary hooks) so no exemption row is needed for them.
const BANNED_REACT_IMPORTS = new Set(["cloneElement", "createRef", "Children", "PureComponent"]);
const BANNED_REACT_DOM_IMPORTS = new Set(["useFormState", "flushSync"]);
const BANNED_MEMBERS = new Set(["React.cloneElement", "React.createRef"]);
const CHILDREN_MEMBER_PREFIX = "React.Children.";
const BANNED_BASES = new Set(["Component", "PureComponent", "React.Component", "React.PureComponent"]);
// The structural carve-out: a class declaring either of these IS an error boundary (there is no hook form).
const BOUNDARY_MEMBERS = new Set(["componentDidCatch", "getDerivedStateFromError"]);

const GATE_SELF = "scripts/check/gates/no-legacy-react-api.ts";
// Assembled from parts on purpose: this module is itself in the scanned project, and spelling the marker
// literally here would make the gate file its own stale-marker violation.
const IGNORE_WORD = "ignore";
const MARKER_TEXT = `@orb-gate-${IGNORE_WORD} no-legacy-react-api`;
const MARKER_RE = new RegExp(`@orb-gate-${IGNORE_WORD}\\s+no-legacy-react-api\\b`, "u");

const MESSAGE =
  "a legacy React API — `cloneElement` / `createRef` / `Children.*` / `PureComponent` / a non-boundary class " +
  "component / react-dom's `useFormState` / `flushSync`. React 19 has a modern equivalent for each, and this tree " +
  "runs the React Compiler full-compile (Core-Path-Registry.md D54), which none of these cooperate with. The one " +
  "legitimate class component is an ERROR BOUNDARY, and it is recognised structurally, never by an allowlist row " +
  "(packages/ui/src/markdown/markdown.tsx is the archetype).";

const FIX =
  "`cloneElement` → pass the prop through explicitly, or a render prop; `createRef` → `useRef` (or a plain `ref` " +
  "prop — React 19 dropped forwardRef); `Children.map/toArray` → accept a typed children prop or a data array; " +
  "`PureComponent` → a function component (the Compiler memoizes it); a class component → a function component, " +
  "UNLESS it is an error boundary (declare `componentDidCatch` or `static getDerivedStateFromError` and this gate " +
  "passes it structurally); `useFormState` → `useActionState` from react; `flushSync` → let React batch, or drive " +
  "the DOM through a ref. Where the library's own interface IS the legacy shape, mark the exact site with the " +
  `house \`${MARKER_TEXT}\` comment plus a cited reason — it is two-sided, so a marker guarding nothing goes RED.`;

const STALE_MARKER_PREFIX =
  "a no-legacy-react-api escape marker that guards NO live violation any more — the legacy API it forgave is gone, " +
  "and the marker now silently pre-authorizes the next one written under it. Delete the comment " +
  "(scripts/check/GATE-AUTHORING.md §4): ";

/** Every marker comment line found this run, `rel:line`. */
const markerSites = new Set<string>();
/** Every marker line that a live violation actually attributed to, `rel:line`. */
const usedMarkerSites = new Set<string>();

/** The lines of the escape markers that guard THIS node — the same walk `pass.ts`'s `hasGateIgnore` does
 *  (leading comments from the node up to its statement/file boundary), collecting positions instead of a
 *  boolean, so the stale arm knows which markers are earning their keep. */
function guardingMarkerLines(node: Node): number[] {
  const out: number[] = [];
  let scan: Node | undefined = node;
  while (scan !== undefined) {
    for (const c of scan.getLeadingCommentRanges()) {
      if (MARKER_RE.test(c.getText())) {
        out.push(node.getSourceFile().getLineAndColumnAtPos(c.getPos()).line);
      }
    }
    const kindName = scan.getKindName();
    if (kindName === "SourceFile" || kindName.includes("Statement")) {
      break;
    }
    scan = scan.getParent();
  }
  return out;
}

/** Report a node-anchored finding and credit any escape marker that suppresses it. */
function judge(node: Node, sf: SourceFile, ctx: GateRunCtx): void {
  const rel = repoRel(ctx.root, sf.getFilePath());
  for (const line of guardingMarkerLines(node)) {
    usedMarkerSites.add(`${rel}:${line}`);
  }
  ctx.report(node); // NODE overload — suppressible, which is what makes the marker work at all
}

/** Arm 1 + arm 4: a banned named import, keyed on the IMPORTED name (an alias buys nothing). */
function bannedImport(node: Node): boolean {
  if (!TsNode.isImportSpecifier(node)) {
    return false;
  }
  const spec = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
  const name = node.getName();
  return (spec === REACT_SPECIFIER && BANNED_REACT_IMPORTS.has(name)) || (spec === REACT_DOM_SPECIFIER && BANNED_REACT_DOM_IMPORTS.has(name));
}

/** Arm 2: `React.cloneElement` / `React.createRef` / any `React.Children.<member>`. Matching the OUTER
 *  property access means `React.Children.toArray` reports once, not twice. */
function bannedMember(node: Node): boolean {
  if (!TsNode.isPropertyAccessExpression(node)) {
    return false;
  }
  const text = node.getText();
  return BANNED_MEMBERS.has(text) || text.startsWith(CHILDREN_MEMBER_PREFIX);
}

/** Does this class declare an error-boundary hook? Read off the MEMBER NAMES, so both the static
 *  `getDerivedStateFromError` and the instance `componentDidCatch` (with or without `override`) count. */
function isErrorBoundary(cls: ClassDeclaration): boolean {
  return cls.getMembers().some((m) => {
    const name = TsNode.isMethodDeclaration(m) || TsNode.isPropertyDeclaration(m) ? m.getName() : undefined;
    return name !== undefined && BOUNDARY_MEMBERS.has(name);
  });
}

/** Arm 3: a class extending Component/PureComponent that is not an error boundary. Keyed on
 *  ClassDeclaration, so an `interface X extends ComponentProps<"div">` is type-level and never matches. */
function bannedClass(node: Node): boolean {
  if (!TsNode.isClassDeclaration(node)) {
    return false;
  }
  const base = node.getExtends()?.getExpression().getText();
  return base !== undefined && BANNED_BASES.has(base) && !isErrorBoundary(node);
}

export const gate: GateDescriptor = {
  name: "no-legacy-react-api",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Spine-TypeScript-and-Patterns.md §1",
  status: "active",
  scopeSafety: "incremental-safe", // per-file verdicts; the stale-marker arm is per-file too (marker + site co-locate)
  message: MESSAGE,
  fix: FIX,
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ClassDeclaration],

  begin: () => {
    markerSites.clear();
    usedMarkerSites.clear();
  },

  visitFile: (sf, ctx) => {
    const text = sf.getFullText();
    if (!text.includes(MARKER_TEXT)) {
      return;
    }
    const rel = repoRel(ctx.root, sf.getFilePath());
    text.split("\n").forEach((line, i) => {
      if (MARKER_RE.test(line)) {
        markerSites.add(`${rel}:${i + 1}`);
      }
    });
  },

  visit: (node, sf, ctx) => {
    if (bannedImport(node) || bannedMember(node) || bannedClass(node)) {
      judge(node, sf, ctx);
    }
  },

  finalize: (ctx) => {
    // TWO-SIDED, and it needs no real-tree anchor: a marker and the violation it guards co-locate in ONE
    // file, so the claim is per-file and equally true on a conformance mini-project.
    for (const site of markerSites) {
      if (!usedMarkerSites.has(site)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_MARKER_PREFIX + site });
      }
    }
  },

  mustFlag: [
    {
      files: { "packages/ui/src/x/x.tsx": 'import { cloneElement } from "react";\nexport const c = cloneElement;\n' },
      expect: { count: 1, messageIncludes: "legacy React API" },
      why: "ARM 1 — the react ImportSpecifier door: `cloneElement` mutates somebody else's element instead of passing the prop",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": 'import { Children, createRef, PureComponent } from "react";\nexport const c = [Children, createRef, PureComponent];\n',
      },
      expect: { count: 3 },
      why: "ARM 1, every remaining name — one finding per specifier, so a multi-name import cannot smuggle two of them in behind one report",
    },
    {
      files: { "packages/ui/src/x/x.tsx": 'import React from "react";\nexport const a = React.Children.toArray([]);\n' },
      expect: { count: 1 },
      why: "ARM 2 — `React.Children.<anything>`: a namespace import has no ImportSpecifier, so the member access is the only door (and the OUTER access matching means exactly one finding, not two)",
    },
    {
      files: { "packages/ui/src/x/x.tsx": 'import React from "react";\nexport const r = React.createRef();\n' },
      expect: { count: 1 },
      why: "ARM 2 — the `React.`-qualified spelling of a banned helper",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": "export class Legacy extends Component<P, S> {\n  render() {\n    return null;\n  }\n}\n",
      },
      expect: { count: 1 },
      why: "ARM 3, the PAIRED-tag class fixture — a real class body with a render method and NEITHER boundary hook: a function component with hooks is the modern shape",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": "export class LegacyPure extends React.PureComponent<P, S> {\n  render() {\n    return null;\n  }\n}\n",
      },
      expect: { count: 1 },
      why: "ARM 3 — the `React.`-qualified base: PureComponent's shallow-compare is exactly what the Compiler does for free",
    },
    {
      files: {
        "packages/client/src/features/x/components/x.tsx":
          'import { flushSync, useFormState } from "react-dom";\nexport const c = [flushSync, useFormState];\n',
      },
      expect: { count: 2 },
      why: "ARM 4 — the react-DOM door: `useFormState` was renamed to `useActionState` and `flushSync` fights React 19 batching (packages/ui/src/primitives/virtual-list/virtual-list.tsx documents that fight)",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": `// ${MARKER_TEXT}: obsolete — the legacy call it forgave is gone\nexport const clean = 1;\n`,
      },
      expect: { count: 1, messageIncludes: "guards NO live violation" },
      why: "the marker vocabulary's OTHER side — an escape guarding nothing is a loaded gun that pre-authorizes the next legacy API written under it, so it reds on its own (GATE-AUTHORING.md §4)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/x/x.tsx":
          "export class Boundary extends Component<P, S> {\n  static getDerivedStateFromError(): S {\n    return { failed: true };\n  }\n  override componentDidCatch(): void {}\n  render() {\n    return null;\n  }\n}\n",
      },
      why: "the STRUCTURAL carve-out, not an allowlist row: an error boundary has no hook form, so a class declaring `getDerivedStateFromError`/`componentDidCatch` passes wherever it lives (packages/ui/src/markdown/markdown.tsx's MarkdownErrorBoundary must never need a row)",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx":
          'import type { ComponentProps } from "react";\nexport interface RowProps extends ComponentProps<"div"> {\n  readonly n: number;\n}\n',
      },
      why: "an INTERFACE extending `ComponentProps<…>` is type-level composition, the single most common shape in packages/ui/src — arm 3 keys on ClassDeclaration, which excludes it by construction",
    },
    {
      files: { "packages/ui/src/x/x.tsx": 'import type { Component } from "react";\nexport type C = Component;\n' },
      why: "`Component` is not in the banned import set at all (type-only or otherwise) — the error boundaries import it as a VALUE, and arm 3 judges the class instead, so no boundary ever needs an exemption",
    },
    {
      files: {
        "packages/ui/src/x/x.tsx": `// ${MARKER_TEXT}: the library's interface IS children\nimport { Children } from "react";\nexport const a = Children;\n`,
      },
      why: "the marker's live side — a cited escape at the exact site suppresses the finding AND is credited, so the stale arm does not then fire on it",
    },
  ],
};
