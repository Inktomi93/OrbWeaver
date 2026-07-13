// Gate: test-presence-client — LIVE (activated W1-1). The @orb/client + non-primitive @orb/ui reach
// test-presence lacks (that gate scans server/contracts only). docs/architecture/core/Spine-Testing.md
// §5: a test is REQUIRED "on exactly the surfaces where an untested change silently breaks behavior —
// no blanket per-file coverage (that breeds assertion-free filler)". This gate encodes the CONSERVATIVE
// client/ui surface — the behavioral factories + logic modules, never every leaf component:
//
//   A. client data/forms/state primitives — a DIRECT child of packages/client/src/{data,forms,state}
//      with a callable export (an exported function/class, or a const bound to an arrow/fn) needs a
//      .test.ts / .int.test.ts / .test.tsx / .ct.tsx at its tests/client mirror. These are the
//      cross-cutting seals every feature composes (createEntityMutation, createCollectionSurface,
//      useGatedQuery, the form/draft factories) — an untested change here breaks behavior everywhere
//      DOWNSTREAM silently. EXCLUDED: nested buckets (forms/bound-fields/*, data/bus/*) — bound-fields
//      are leaf field components (the "not every leaf" line), and data/bus/applyChatBusEvent is the
//      Phase-6 chat reducer whose exhaustiveness is audit #8 / chat-lane work, not W1-0. Files with no
//      callable export (barrels, `export const {…} = createFormHook()` destructures, type-only) are
//      naturally skipped.
//   B. non-primitive @orb/ui logic modules — a file under packages/ui/src/{charts,markdown,stream,
//      content,code-editor,diff,fuzzy-search} with a callable export needs a test somewhere in its
//      tests/ui mirror DIRECTORY (DIR-LEVEL, not per-file — looser than clause A). These carry real
//      logic (option-builders, stream math, markdown policy, cosine search) OUTSIDE the
//      ui-primitive-structure §13.7 CT mandate (which only reaches primitives/), but a group is
//      legitimately exercised as a unit (a pure helper via its component's CT, a builder via a sibling
//      snap/option test under a different basename) — so a co-located test file anywhere in the module's
//      dir satisfies presence. Bare primitives/ are already presence-covered by that gate's CT clause.
//      WHY the client tier (A) is STRICTER (per-file): each client factory is INDEPENDENTLY composed by
//      features, so each needs its own behavioral test; a ui-logic group ships + is tested together.
//
// W1-0c (2026-07-04, scratch/dev-tooling-support-kit-plan.md) built this DORMANT because it found REAL
// debt that would have blocked the W1-0 wave from committing (green-to-commit):
//   FINDINGS AT DISCOVERY (8 client files; the ui side — dir-level clause B — was already covered = 0):
//     data/trpc.ts · data/query-client.ts · data/invalidation.ts · data/use-gated-query.ts ·
//     data/create-entity-mutation.ts · data/create-collection-surface.ts ·
//     forms/create-autosave-entity-form.ts · state/chat-handle.ts
// W1-1 (2026-07-04) resolved every finding and flipped this gate LIVE (`report.ts` ALL_CHECKS):
//   behavioral tests added — invalidation.test.ts, use-gated-query.ct.tsx,
//   create-collection-surface.ct.tsx, create-entity-mutation.ct.tsx (extended), chat-handle.test.ts,
//   query-client.test.ts (the bespoke staleTime/onError-toast policy IS behavior worth pinning);
//   create-autosave-entity-form.ct.tsx already existed. `data/trpc.ts` got the OTHER outcome the
//   header always flagged as possible — a narrow per-file exclusion (CLIENT_EXCLUDE_FILES below),
//   because its two exports are thin `@trpc/client` constructors with no bespoke logic of their own
//   (`query-client.ts`'s bespoke onError/staleTime policy is what earned IT a real test instead).
//
// Self-tested: tests/tooling/test-presence-client.int.test.ts drives it over an in-memory ts-morph
// project (fixtures with/without a callable export, with/without a mirror test) proving fire AND
// no-false-positive, never the real tree.
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
// W1-1 per-file exclusion (narrower than a nested-bucket exclusion — this is ONE file, not a
// directory): `data/trpc.ts`'s two callable exports (`createTrpcClient`/`createTrpcProxy`) are thin
// factories that only construct the `@trpc/client`/`@trpc/tanstack-react-query` library objects —
// exactly the "a callable-export that only constructs a library client asserts little" case this
// gate's own header calls out for `trpc.ts`/`query-client.ts`. `query-client.ts` got the OTHER
// answer (a real behavioral test — `tests/client/data/query-client.test.ts`) because it encodes
// bespoke, load-bearing policy (staleTime Infinity not 'static', the onError→toast wiring); `trpc.ts`
// has no such bespoke logic of its own to assert on in isolation — its wire behavior (the CSRF
// header, the query/subscription splitLink routing) is exercised END-TO-END by every `.ct.tsx` that
// mounts through `CtDataProviders` (which calls `createTrpcClient()` for the real network path every
// CT test drives), so an isolated unit test here would just re-assert "the library was called with
// these args" — the exact tautology Spine-Testing.md §5 warns against.
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
