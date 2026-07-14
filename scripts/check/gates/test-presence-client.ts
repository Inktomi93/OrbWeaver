// Gate: test-presence-client — the @orb/client + non-primitive @orb/ui reach test-presence lacks
// (docs/architecture/core/Spine-Testing.md §5: a test is required only where an untested change
// silently breaks behavior downstream, not blanket per-file coverage). Clause A: client
// data/forms/state primitives need a per-file mirror test (each is composed independently). Clause B:
// non-primitive @orb/ui logic groups need any test in their mirror directory (bare primitives/ are covered by ui-primitive-structure's CT).
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
const UI_SRC = "/packages/ui/src/";
const EXT_RE = /\.tsx?$/u;
// The client tiers this gate reaches, and (for A) the nested buckets it deliberately does NOT.
const CLIENT_TIERS = ["data/", "forms/", "state/"];
const CLIENT_EXCLUDE_NESTED = ["data/bus/", "forms/bound-fields/"];
// `data/trpc.ts`'s two exports are thin `@trpc/client` constructors with no bespoke logic of their
// own to unit-test in isolation — their wire behavior is exercised end-to-end by every `.ct.tsx` that
// mounts via `CtDataProviders`, so an isolated test here would just re-assert "the library was called".
const CLIENT_EXCLUDE_FILES = ["data/trpc.ts"];
// Non-primitive @orb/ui logic groups (primitives/ are covered by ui-primitive-structure's CT clause).
const UI_LOGIC_GROUPS = [
  "charts/",
  "markdown/",
  "stream/",
  "content/",
  "code-editor/",
  "diff/",
  "fuzzy-search/",
];
const TEST_KINDS = [".test.ts", ".int.test.ts", ".test.tsx", ".ct.tsx"] as const;

const MSG_CLIENT =
  "client data/forms/state primitive has no test — add a .test.ts / .int.test.ts / .ct.tsx at its tests/client mirror. These seals are composed by every feature; an untested change breaks behavior downstream silently (Spine-Testing.md §5).";
const MSG_UI =
  "non-primitive @orb/ui logic module has no test — add a .test.ts / .ct.tsx at its tests/ui mirror (Spine-Testing.md §5).";

function relAfter(path: string, marker: string): string | undefined {
  const idx = path.indexOf(marker);
  return idx === -1 ? undefined : path.slice(idx + marker.length);
}

// A file carries runtime LOGIC (vs only types/data/re-exports) if it exports a function, a class, or a
// const bound to an arrow/function expression. Destructured or plain-value exports are NOT callable.
function hasCallableExport(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported())) {
    return true;
  }
  if (sf.getClasses().some((c) => c.isExported())) {
    return true;
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        return true;
      }
    }
  }
  return false;
}

// Clause A — strict per-file mirror: a test at tests/<pkg>/<same path, test suffix>.
function hasMirrorTest(root: string, pkg: string, rel: string): boolean {
  const base = rel.replace(EXT_RE, "");
  return TEST_KINDS.some((kind) => existsSync(join(root, "tests", pkg, `${base}${kind}`)));
}

// Clause B — dir-level presence: ANY test file in the module's mirror directory (a ui-logic group is
// exercised as a unit, often under a different basename — a helper via its component's CT, a builder
// via a sibling snap/option test).
function hasDirTest(root: string, pkg: string, rel: string): boolean {
  const mirrorDir = join(root, "tests", pkg, dirname(rel));
  if (!existsSync(mirrorDir)) {
    return false;
  }
  return readdirSync(mirrorDir, { withFileTypes: true }).some(
    (e) => e.isFile() && TEST_KINDS.some((kind) => e.name.endsWith(kind)),
  );
}

// Clause A — a DIRECT child of a client tier (data/x.ts), excluding the nested buckets + the named
// per-file exclusions (CLIENT_EXCLUDE_FILES — see its own comment for why each one is there).
function clientTierRel(rel: string): string | undefined {
  const tier = CLIENT_TIERS.find((t) => rel.startsWith(t));
  if (
    tier === undefined ||
    CLIENT_EXCLUDE_NESTED.some((n) => rel.startsWith(n)) ||
    CLIENT_EXCLUDE_FILES.includes(rel)
  ) {
    return;
  }
  // Direct child only: `data/x.ts` (one segment after the tier), not `data/sub/x.ts`.
  return rel.slice(tier.length).includes("/") ? undefined : rel;
}

/** The fs+AST scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanTestPresenceClient(root: string, project: Project): Violation[] {
  const out: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    if (sf.getBaseName() === "index.ts") {
      continue;
    }
    const path = sf.getFilePath();
    const clientRel = relAfter(path, CLIENT_SRC);
    if (clientRel !== undefined) {
      const tierRel = clientTierRel(clientRel);
      if (
        tierRel !== undefined &&
        hasCallableExport(sf) &&
        !hasMirrorTest(root, "client", clientRel)
      ) {
        out.push({ file: `packages/client/src/${clientRel}`, line: 0, message: MSG_CLIENT });
      }
      continue;
    }
    const uiRel = relAfter(path, UI_SRC);
    if (
      uiRel !== undefined &&
      UI_LOGIC_GROUPS.some((g) => uiRel.startsWith(g)) &&
      hasCallableExport(sf) &&
      !hasDirTest(root, "ui", uiRel)
    ) {
      out.push({ file: `packages/ui/src/${uiRel}`, line: 0, message: MSG_UI });
    }
  }
  return out;
}

// The client/ui twin of test-presence: reconciles client/ui logic-bearing source (AST callable-export
// detection) against its mirror test (existsSync).
export const gate: GateDescriptor = {
  name: "test-presence-client",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MSG_CLIENT,
  fix: "add the mirror test (tests/client/<rest> or the ui dir test) for the logic-bearing source file.",
  run: (ctx) => {
    for (const v of scanTestPresenceClient(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
      },
      why: "a logic-bearing client data hook with no mirror test — an untested surface (§5)",
    },
    {
      // clause B: a ui-logic module with NO test anywhere in its mirror dir.
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
      },
      expect: { messageIncludes: "non-primitive @orb/ui logic module" },
      why: "clause B: a ui-logic module (markdown/policy) with no test in its mirror dir — fires (dir-level)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
        "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
      },
      why: "the hook has its mirror .test.ts — presence satisfied, passes",
    },
    {
      // clause A: a file with no callable export (plain value / barrel) is naturally skipped.
      files: {
        "packages/client/src/data/constants.ts": "export const X = 1;\n",
      },
      why: "clause A: a file with NO callable export (plain value) is not a logic surface — passes",
    },
    {
      // clause A: the nested buckets (data/bus, forms/bound-fields) are excluded.
      files: {
        "packages/client/src/data/bus/apply-chat-bus-event.ts":
          "export function build(): number {\n  return 1;\n}\n",
        "packages/client/src/forms/bound-fields/text-field.tsx":
          "export function build(): number {\n  return 1;\n}\n",
      },
      why: "clause A: nested buckets (data/bus, forms/bound-fields) are deliberately excluded — passes",
    },
    {
      // clause B dir-level: a sibling test (different basename) in the mirror dir satisfies presence.
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/ui/src/markdown/to-plain-text.ts":
          "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
      },
      why: "clause B dir-level: a sibling test (different basename) in the mirror dir satisfies presence — passes",
    },
    {
      // bare primitives/ are covered by ui-primitive-structure's CT clause — not scanned here.
      files: {
        "packages/ui/src/primitives/button/button.tsx":
          "export function build(): number {\n  return 1;\n}\n",
      },
      why: "bare primitives/ are covered by ui-primitive-structure's CT clause — not scanned here, passes",
    },
  ],
};
