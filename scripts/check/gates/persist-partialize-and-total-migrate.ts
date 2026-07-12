// Gate: persist-partialize-and-total-migrate (UI-Gates-and-Lessons.md §11.5 + UI-Primitives-and-Reuse.md
// §13.1/§13.3). Zustand `persist()` is partly IRREVERSIBLE: 9 of 11 neo stores persisted a non-primitive
// shape with no `version`/`migrate`, and once a stale blob is in a user's localStorage you cannot migrate
// from a version line you never shipped. orbweaver forces every persist through ONE of two minting
// factories (state/create-persisted-store.ts / state/create-entity-draft-store.ts) that bake
// `partialize` (only the intended keys survive) + `version` + a TOTAL crash-proof `migrate` (any
// unknown/corrupt shape degrades to a default, never a throw). This belt catches the middleware DIRECTLY
// — the structural companion to persistence-boundary's storage-API arm, and the Layer-3 twin of the
// Layer-2 grit `no-raw-zustand-persist`:
//   • ARM A — a `persist(` call (AST — comments don't count) in packages/client/src/** outside the two
//     factories is RED (device-local state persists THROUGH a factory, never a bare persist).
//   • ARM B — inside each factory, the `persist(initializer, { … })` options object MUST carry
//     `version`, `partialize`, and `migrate` keys — a refactor that drops one goes RED here (the grit
//     can only see the call SITE; this reads INTO the chokepoint).
//
// WHAT IT DELIBERATELY DOES NOT FLAG: the two factories' own `persist(` calls (ARM A allowlists them,
// ARM B instead asserts their option shape); non-persist middleware (`devtools`/`subscribeWithSelector`).
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";

/** The two persist-minting factories — the ONLY sanctioned `persist(` call sites. */
const FACTORY_FILES = new Set([
  "packages/client/src/state/create-persisted-store.ts",
  "packages/client/src/state/create-entity-draft-store.ts",
]);

/** The keys a persist options object MUST carry (the irreversibility guard). */
const REQUIRED_KEYS = ["version", "partialize", "migrate"] as const;

const RAW_PERSIST_MESSAGE =
  "raw zustand persist() outside the two minting factories — persistence footguns (partialize / " +
  "version + total-migrate / storage-key uniqueness) are baked into createPersistedStore / " +
  "createEntityDraftStore; use one, never a bare persist (UI-Gates-and-Lessons.md §11.5).";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

/** Every `persist(...)` call whose callee is the bare `persist` identifier (the zustand middleware). */
function persistCalls(sf: SourceFile): CallExpression[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const callee = call.getExpression();
    return Node.isIdentifier(callee) && callee.getText() === "persist";
  });
}

/** ARM A — a bare `persist(` outside the factories. */
function rawPersistViolations(sf: SourceFile, rel: string): Violation[] {
  return persistCalls(sf).map((call) => ({
    file: rel,
    line: call.getStartLineNumber(),
    message: RAW_PERSIST_MESSAGE,
  }));
}

/** ARM B — the factory's persist options object carries version + partialize + migrate. */
function factoryOptionViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const call of persistCalls(sf)) {
    const opts = call.getArguments()[1];
    if (opts === undefined || !Node.isObjectLiteralExpression(opts)) {
      continue;
    }
    for (const key of REQUIRED_KEYS) {
      if (opts.getProperty(key) === undefined) {
        out.push({
          file: rel,
          line: call.getStartLineNumber(),
          message: `persist options missing \`${key}\` in the minting factory — every persist bakes version + partialize + total-migrate (UI-Primitives-and-Reuse.md §13.1; this file).`,
        });
      }
    }
  }
  return out;
}

export const persistPartializeAndTotalMigrate: Check = {
  name: "persist-partialize-and-total-migrate",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = clientRel(sf.getFilePath());
      if (rel === undefined) {
        continue;
      }
      if (FACTORY_FILES.has(rel)) {
        violations.push(...factoryOptionViolations(sf, rel));
        continue;
      }
      violations.push(...rawPersistViolations(sf, rel));
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a per-FILE dispatch gate via visitFile) ──────────────────────
// Two arms, per-FILE dispatch: a factory file runs ARM B (its persist options must carry version +
// partialize + migrate), every other client file runs ARM A (a bare `persist(` is RED). scanRoot mirrors
// the legacy CLIENT_SRC filter. Distinct messages (raw-persist vs missing-key) → per-occurrence overrides.
// Not fsBacked. Byte-identical to the legacy Check. Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "persist-partialize-and-total-migrate",
  docRow: "UI-Gates-and-Lessons.md §11.5 (UI-Primitives-and-Reuse.md §13.1/§13.3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: RAW_PERSIST_MESSAGE,
  fix: "use createPersistedStore / createEntityDraftStore (which bake partialize + version + a total crash-proof migrate) — never a bare persist().",
  scanRoot: (p) => p.includes("packages/client/src/"),
  visitFile: (sf, ctx: GateRunCtx) => {
    const rel = clientRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    const violations = FACTORY_FILES.has(rel)
      ? factoryOptionViolations(sf, rel)
      : rawPersistViolations(sf, rel);
    for (const v of violations) {
      const token = v.message === RAW_PERSIST_MESSAGE ? "raw persist()" : "persist opts";
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message, token });
    }
  },
  mustFlag: [
    {
      files: "export const s = persist(() => ({}), {});\n",
      at: "packages/client/src/features/x/store.ts",
      expect: { messageIncludes: "raw zustand persist" },
      why: "a bare persist() outside the two minting factories — persistence footguns aren't baked in (§11.5)",
    },
  ],
  mustPass: [
    {
      files: "export const s = createPersistedStore('x', () => ({}));\n",
      at: "packages/client/src/features/x/store2.ts",
      why: "a factory mint (createPersistedStore) — no bare persist, the sanctioned door, passes",
    },
  ],
};
