// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are drizzle schema
// fixture snippets (sqliteTable(...) calls), not secrets.
// Gate: db-enum-from-tuple (D34 — a db enum column derives from a CONTRACTS tuple; db never re-spells a
// union). A drizzle column enum config (`text("x", { enum: … })`) must reference an IDENTIFIER — an
// imported `@orb/contracts`/`@orb/kit` tuple, or a local `as const satisfies readonly <ContractsType>[]`
// tuple (the sanctioned db idiom where no z-schema runtime mirror home exists — chat.ts STREAM_DELTA_KINDS/
// INJECTION_POSITIONS). It must NEVER be an INLINE ARRAY LITERAL (`{ enum: ["a","b"] }`) — an inline
// re-spelling drifts from the union's one home the moment a member is added. AST-scoped to the schema dir;
// the `enum:` key inside a schema-file object literal is unambiguously the drizzle column config.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const ENUM_KEY = "enum";

const MESSAGE =
  "drizzle column enum config is an INLINE ARRAY LITERAL — a db enum must derive from an imported " +
  "contracts/kit tuple (or a local `as const satisfies` tuple), never a re-spelled array (D34: db never " +
  "re-spells a union). See Core-Path-Registry.md D34.";
// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a PropertyAssignment subscription: an `enum:` key with an inline-array-literal
// initializer, in the db schema dir. scanRoot mirrors the legacy SCHEMA_DIR filter. Per-occurrence (each
// inline-array enum config).
export const gate: GateDescriptor = {
  name: "db-enum-from-tuple",
  docRow: "Core-Path-Registry.md D34",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "reference an imported contracts/kit tuple (or a local `as const satisfies readonly <ContractsType>[]` tuple) — db never re-spells a union.",
  scanRoot: (p) => SCHEMA_DIR.test(`/${p}`),
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.PropertyAssignment) || node.getName() !== ENUM_KEY) {
      return;
    }
    if (node.getInitializerOrThrow().isKind(SyntaxKind.ArrayLiteralExpression)) {
      ctx.report(node, { token: "enum: [...]", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'export const t = sqliteTable("t", { k: text("k", { enum: ["a", "b"] }) });\n',
      at: "packages/db/src/schema/x.ts",
      why: "an inline-array enum config — a re-spelled union that drifts from its one home (D34)",
    },
  ],
  mustPass: [
    {
      files:
        'import { KINDS } from "@orb/contracts";\nexport const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      at: "packages/db/src/schema/y.ts",
      why: "an imported contracts tuple identifier — the sanctioned derive-from-one-home idiom, passes",
    },
    {
      files:
        'const KINDS = ["text", "reasoning"] as const satisfies readonly string[];\nexport const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      at: "packages/db/src/schema/z.ts",
      why: "a local `as const satisfies` tuple identifier — the sanctioned db idiom where no z-schema home exists",
    },
    {
      files: 'export const t = sqliteTable("t", { k: text("k", { enum: ["a", "b"] }) });\n',
      at: "packages/server/src/x.ts",
      why: "scope: an inline enum config OUTSIDE the schema dir is not a drizzle column config — not scanned",
    },
  ],
};
