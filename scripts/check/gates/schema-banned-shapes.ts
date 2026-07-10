// Gate: schema-banned-shapes — ONE registry-driven gate over the ledger's explicitly-REJECTED schema +
// contract shapes. Each row is a (location, forbidden shape, D-cite) the ledger killed by name; a
// reintroduction (an amnesiac agent re-porting a neo pattern) is RED with the cite. The registry is the
// extensible-forever table shape — a new "we decided NOT to have X" ruling adds one row.
//
// The rows (verified against the ledger text before encoding):
//   • chats.ownerId (D18 — chats are MEMBERSHIP-scoped, the column is DROPPED)
//   • chats.memoryEnabled (D36 — memory on/off is a GLOBAL setting, never a per-chat column)
//   • chats.sessionId / chats.sessionDirty (D25 — agent-sdk cache state lives in sdk-session.ts)
//   • any chats.*presetId* (D58 — "we don't bind shit to chats"; the owning feature carries the assoc)
//   • messages.parentId (D27 — ONE branch axis: chat forks, never a message-level DAG)
//   • generation content/economics columns on messages (D26 — messages is a pure SLOT; content + the
//     ~25 economics columns live ONLY on message_variants)
//   • a character_versions table / characters.currentVersionId (D28 — the card is a FLAT characters row)
//   • AppSettings.guidedActions (D33 — a neo PHANTOM; guided actions live ONLY on the preset)
//   • a `kind` field on Principal (D60 — agents are STRUCTURALLY Principal-less; Principal gains NO kind)
//   • the @orb/contracts/sessions namespace (D12 — the contract is `session` SINGULAR; domain is plural)
import type { InterfaceDeclaration, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const TABLE_FN = "sqliteTable";

type ColumnBan = { readonly kind: "column"; table: string; column: string; cite: string };
type ColumnPatternBan = {
  readonly kind: "column-pattern";
  table: string;
  pattern: RegExp;
  label: string;
  cite: string;
};
type TableBan = { readonly kind: "table"; table: string; cite: string };
type InterfaceFieldBan = {
  readonly kind: "interface-field";
  typeName: string;
  field: string;
  cite: string;
};
type SchemaFieldBan = {
  readonly kind: "schema-field";
  schemaVar: string;
  field: string;
  cite: string;
};
type ImportBan = { readonly kind: "import"; specifier: string; cite: string };
type BannedShape =
  | ColumnBan
  | ColumnPatternBan
  | TableBan
  | InterfaceFieldBan
  | SchemaFieldBan
  | ImportBan;

const MESSAGE_ECONOMICS: readonly string[] = [
  "content",
  "reasoning",
  "model",
  "provider",
  "costUsd",
  "promptSnapshot",
  "rawRequest",
  "rawResponse",
  "tokensIn",
  "tokensOut",
  "contextWindow",
  "maxOutputTokens",
  "ttftMs",
];

export const BANNED_SHAPES: readonly BannedShape[] = [
  { kind: "column", table: "chats", column: "ownerId", cite: "D18 (chats are membership-scoped)" },
  {
    kind: "column",
    table: "chats",
    column: "memoryEnabled",
    cite: "D36 (memory on/off is a global setting, not per-chat)",
  },
  {
    kind: "column",
    table: "chats",
    column: "sessionId",
    cite: "D25 (agent-sdk cache → sdk-session.ts)",
  },
  {
    kind: "column",
    table: "chats",
    column: "sessionDirty",
    cite: "D25 (agent-sdk cache → sdk-session.ts)",
  },
  {
    kind: "column-pattern",
    table: "chats",
    pattern: /presetId/iu,
    label: "a *presetId* column",
    cite: "D58 (never bind a preset to a chat; the owning feature carries the association)",
  },
  {
    kind: "column",
    table: "messages",
    column: "parentId",
    cite: "D27 (ONE branch axis: chat forks, not a message DAG)",
  },
  ...MESSAGE_ECONOMICS.map(
    (column): ColumnBan => ({
      kind: "column",
      table: "messages",
      column,
      cite: "D26 (messages is a pure slot; content/economics live only on message_variants)",
    }),
  ),
  { kind: "table", table: "character_versions", cite: "D28 (the card is a flat characters row)" },
  {
    kind: "column",
    table: "characters",
    column: "currentVersionId",
    cite: "D28 (no character_versions, no currentVersionId/circular FK)",
  },
  {
    kind: "schema-field",
    schemaVar: "appSettingsSchema",
    field: "guidedActions",
    cite: "D33 (a neo phantom; guided actions live only on the preset)",
  },
  {
    kind: "interface-field",
    typeName: "Principal",
    field: "kind",
    cite: "D60 (Principal gains NO kind field; agents are structurally Principal-less)",
  },
  {
    kind: "import",
    specifier: "@orb/contracts/sessions",
    cite: "D12 (the contract namespace is `session` singular; there is no `sessions`)",
  },
];

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function bannedMessage(shape: string, cite: string): string {
  return `${shape} is a ledger-REJECTED schema/contract shape (${cite}) — a reintroduction is banned. See scripts/check/gates/schema-banned-shapes.ts and Core-Laws-and-Precedents.md.`;
}

type Table = { sqlName: string; colsObj: Node };

/** Every `sqliteTable("name", { … })` in one schema file (sql name + columns object). */
function tablesIn(sf: SourceFile): Table[] {
  const out: Table[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
      continue;
    }
    const [nameArg, colsArg] = call.getArguments();
    if (nameArg?.isKind(SyntaxKind.StringLiteral) && colsArg !== undefined) {
      out.push({ sqlName: nameArg.getLiteralText(), colsObj: colsArg });
    }
  }
  return out;
}

function columnKeys(colsObj: Node): string[] {
  if (!colsObj.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return [];
  }
  return colsObj.getProperties().flatMap((p) => {
    if (
      p.isKind(SyntaxKind.PropertyAssignment) ||
      p.isKind(SyntaxKind.ShorthandPropertyAssignment)
    ) {
      return [p.getName()];
    }
    return [];
  });
}

function tableBanViolation(found: Table[], rel: string, shape: TableBan): Violation[] {
  if (!found.some((t) => t.sqlName === shape.table)) {
    return [];
  }
  return [
    { file: rel, line: 1, message: bannedMessage(`the \`${shape.table}\` table`, shape.cite) },
  ];
}

function columnBanViolations(
  found: Table[],
  rel: string,
  shape: ColumnBan | ColumnPatternBan,
): Violation[] {
  const table = found.find((t) => t.sqlName === shape.table);
  if (table === undefined) {
    return [];
  }
  const keys = columnKeys(table.colsObj);
  const hits =
    shape.kind === "column"
      ? keys.filter((k) => k === shape.column)
      : keys.filter((k) => shape.pattern.test(k));
  const label = shape.kind === "column" ? `\`${shape.table}.${shape.column}\`` : shape.label;
  return hits.map(() => ({ file: rel, line: 1, message: bannedMessage(label, shape.cite) }));
}

/** Schema-file rules (column / column-pattern / table bans), evaluated over one file's tables. */
function schemaViolations(sf: SourceFile, rel: string): Violation[] {
  const found = tablesIn(sf);
  const out: Violation[] = [];
  for (const shape of BANNED_SHAPES) {
    if (shape.kind === "table") {
      out.push(...tableBanViolation(found, rel, shape));
    } else if (shape.kind === "column" || shape.kind === "column-pattern") {
      out.push(...columnBanViolations(found, rel, shape));
    }
  }
  return out;
}

/** Contract-side rules: interface-field (Principal.kind), schema-field (appSettingsSchema.guidedActions). */
function contractDeclViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const shape of BANNED_SHAPES) {
    if (shape.kind === "interface-field") {
      const iface: InterfaceDeclaration | undefined = sf.getInterface(shape.typeName);
      if (iface?.getProperty(shape.field)) {
        out.push({
          file: rel,
          line: iface.getProperty(shape.field)?.getStartLineNumber() ?? 1,
          message: bannedMessage(`\`${shape.typeName}.${shape.field}\``, shape.cite),
        });
      }
    }
    if (shape.kind === "schema-field") {
      out.push(...schemaFieldViolations(sf, rel, shape));
    }
  }
  return out;
}

function schemaFieldViolations(sf: SourceFile, rel: string, shape: SchemaFieldBan): Violation[] {
  const decl = sf.getVariableDeclaration(shape.schemaVar);
  if (decl === undefined) {
    return [];
  }
  const obj = decl.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
  const prop = obj?.getProperty(shape.field);
  if (prop === undefined) {
    return [];
  }
  return [
    {
      file: rel,
      line: prop.getStartLineNumber(),
      message: bannedMessage(`\`${shape.schemaVar}.${shape.field}\``, shape.cite),
    },
  ];
}

/** Import-ban rules (the @orb/contracts/sessions namespace), over any source file. */
function importViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const shape of BANNED_SHAPES) {
    if (shape.kind !== "import") {
      continue;
    }
    for (const decl of sf.getImportDeclarations()) {
      const spec = decl.getModuleSpecifierValue();
      if (spec === shape.specifier || spec.startsWith(`${shape.specifier}/`)) {
        out.push({
          file: rel,
          line: decl.getStartLineNumber(),
          message: bannedMessage(`an import of \`${shape.specifier}\``, shape.cite),
        });
      }
    }
  }
  return out;
}

export const schemaBannedShapes: Check = {
  name: "schema-banned-shapes",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      const rel = relPath(root, path);
      if (SCHEMA_DIR.test(path)) {
        violations.push(...schemaViolations(sf, rel));
      }
      violations.push(...contractDeclViolations(sf, rel));
      violations.push(...importViolations(sf, rel));
    }
    return violations;
  },
};
