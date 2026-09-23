// ONE home for "the ledger killed this shape BY NAME": each row is a (location, forbidden shape, D-cite)
// the D-ledger rejected, and a reintroduction — an amnesiac agent re-porting a neo pattern — is RED with
// the cite. The table is the extensible-forever shape: a new "we decided NOT to have X" ruling adds a row.
//
// TWO PARTITIONS, TWO POLICIES, ONE VOCABULARY. The rows split by EVIDENCE PLANE, not by topic: the schema
// partition is judged on the shared Drizzle fact (`schema-banned-shapes`), the contract partition on
// authored contract declarations (`contract-banned-shapes`). They are separate policy ids because they read
// different subjects, and they import their own partition from here so the D-cite text has one spelling.
//
// D12 IS NOT HERE — IT MOVED TO BIOME. The `@orb/contracts/sessions` import ban is a plain module-specifier
// ban, which the native `style/noRestrictedImports` rule owns completely (biome.json →
// linter.rules.style.noRestrictedImports.options.patterns), pinned by
// tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts. GATE-AUTHORING §10: never mirror an enabled native
// lint rule.
//
// AUTHORITY IS HARD ON BOTH POLICIES, BY DESIGN: a ledger verdict's only escape is contesting the D-cite in
// its docs/adr/ decision, never a comment written at the reintroduction site by the same hand.

import type { ContractBannedShape, LedgerColumnBan, SchemaBannedShape } from "../contract/ledger-banned-shapes.ts";

/** D26: `messages` is a pure SLOT — content and economics live only on `message_variants`. */
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

/** Judged on the shared Drizzle schema fact: tables by SQL name, columns by PROPERTY name (the identity the
 *  authored schema object declares, which is what a reintroduction re-spells). */
export const SCHEMA_BANNED_SHAPES: readonly SchemaBannedShape[] = [
  { kind: "column", table: "chats", column: "ownerId", cite: "D18 (chats are membership-scoped)" },
  { kind: "column", table: "chats", column: "memoryEnabled", cite: "D36 (memory on/off is a global setting, not per-chat)" },
  { kind: "column", table: "chats", column: "sessionId", cite: "D25 (agent-sdk cache → sdk-session.ts)" },
  { kind: "column", table: "chats", column: "sessionDirty", cite: "D25 (agent-sdk cache → sdk-session.ts)" },
  {
    kind: "column-pattern",
    table: "chats",
    pattern: /presetId/iu,
    label: "a *presetId* column",
    cite: "D58 (never bind a preset to a chat; the owning feature carries the association)",
  },
  { kind: "column", table: "messages", column: "parentId", cite: "D27 (ONE branch axis: chat forks, not a message DAG)" },
  ...MESSAGE_ECONOMICS.map(
    (column): LedgerColumnBan => ({
      kind: "column",
      table: "messages",
      column,
      cite: "D26 (messages is a pure slot; content/economics live only on message_variants)",
    }),
  ),
  { kind: "table", table: "character_versions", cite: "D28 (the card is a flat characters row)" },
  { kind: "column", table: "characters", column: "currentVersionId", cite: "D28 (no character_versions, no currentVersionId/circular FK)" },
];

/** Judged on authored `@orb/contracts` declarations — a different evidence plane from the Drizzle fact. */
export const CONTRACT_BANNED_SHAPES: readonly ContractBannedShape[] = [
  {
    kind: "schema-field",
    schemaVar: "appSettingsSchema",
    field: "guidedActions",
    home: "packages/contracts/src/settings/index.ts",
    cite: "D33 (a neo phantom; guided actions live only on the preset)",
  },
  {
    kind: "interface-field",
    typeName: "Principal",
    field: "kind",
    home: "packages/contracts/src/identity/index.ts",
    cite: "D60 (Principal gains NO kind field; agents are structurally Principal-less)",
  },
];

/** The declared ONE home of a contract ban's named subject — the anchor its two-sided blindness arm uses. */
export function contractBanHome(shape: ContractBannedShape): string {
  return shape.home;
}

/** The ONE finding sentence both policies print — the shape, its D-cite, and where to contest it. */
export function bannedMessage(shape: string, cite: string): string {
  return `${shape} is a ledger-REJECTED schema/contract shape (${cite}) — a reintroduction is banned. See tooling/src/verify/lib/ledger-banned-shapes.ts and the cited docs/adr/ decision.`;
}
