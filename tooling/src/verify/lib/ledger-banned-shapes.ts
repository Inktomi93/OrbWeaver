// The ledger's rejected CONTRACT shapes: each row is a (location, forbidden shape, D-cite) the D-ledger rejected, and a
// reintroduction is RED with the cite. The D12 `@orb/contracts/sessions` import ban is biome's native `noRestrictedImports`
// (pinned by tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts); the schema partition is
// tests/db/schema/table-integrity.suite.test.ts. HARD by design: a ledger verdict's only escape is contesting the D-cite.

import type { ContractBannedShape } from "../contract/ledger-banned-shapes.ts";

/** Judged on authored `@orb/contracts` declarations. */
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

/** The ONE finding sentence the policy prints — the shape, its D-cite, and where to contest it. */
export function bannedMessage(shape: string, cite: string): string {
  return `${shape} is a ledger-REJECTED schema/contract shape (${cite}) — a reintroduction is banned. See tooling/src/verify/lib/ledger-banned-shapes.ts and the cited docs/adr/ decision.`;
}
