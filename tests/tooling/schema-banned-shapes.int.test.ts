// Self-test for the DORMANT `schema-banned-shapes` gate (scripts/check/gates/schema-banned-shapes.ts —
// the registry of ledger-REJECTED schema/contract shapes; held out of ALL_CHECKS pending doc
// reconciliation). Proves each registry-row KIND fires (column · column-pattern · table · interface-field ·
// schema-field · import) and that born-compliant shapes pass.
import { schemaBannedShapes } from "../../scripts/check/gates/schema-banned-shapes.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const SCHEMA = "packages/db/src/schema/thing.ts";

function run(files: Record<string, string>): ReturnType<typeof schemaBannedShapes.run> {
  return schemaBannedShapes.run(ctxFor(files));
}

test("column: chats.ownerId fires (D18)", () => {
  const src = 'export const t = sqliteTable("chats", { ownerId: text("owner_id") });\n';
  const v = run({ [SCHEMA]: src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D18");
});

test("column: a messages economics column fires (D26)", () => {
  const src = 'export const t = sqliteTable("messages", { content: text("content") });\n';
  const v = run({ [SCHEMA]: src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D26");
});

test("column-pattern: any chats.*presetId* fires (D58)", () => {
  const src =
    'export const t = sqliteTable("chats", { activePresetId: text("active_preset_id") });\n';
  const v = run({ [SCHEMA]: src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D58");
});

test("table: a character_versions table fires (D28)", () => {
  const src = 'export const t = sqliteTable("character_versions", { id: text("id") });\n';
  const v = run({ [SCHEMA]: src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D28");
});

test("interface-field: a `kind` field on Principal fires (D60)", () => {
  const src = "export interface Principal {\n  userId: string;\n  kind: string;\n}\n";
  const v = run({ "packages/contracts/src/identity/index.ts": src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D60");
});

test("schema-field: appSettingsSchema.guidedActions fires (D33)", () => {
  const src =
    "export const appSettingsSchema = z.object({\n  guidedActions: z.array(z.string()),\n});\n";
  const v = run({ "packages/contracts/src/settings/index.ts": src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D33");
});

test("import: an @orb/contracts/sessions import fires (D12)", () => {
  const src = 'import { X } from "@orb/contracts/sessions";\nexport const y = 1;\n';
  const v = run({ "packages/server/src/x.ts": src });
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D12");
});

test("born-compliant shapes pass (chats slot, messages slot, Principal, singular session import)", () => {
  const files = {
    "packages/db/src/schema/chat.ts":
      'export const c = sqliteTable("chats", { id: text("id"), hostUserId: text("host_user_id") });\n' +
      'export const m = sqliteTable("messages", { id: text("id"), role: text("role") });\n',
    "packages/contracts/src/identity/index.ts":
      "export interface Principal {\n  userId: string;\n  role: string;\n}\n",
    "packages/server/src/x.ts":
      'import { X } from "@orb/contracts/session";\nexport const y = 1;\n',
  };
  expect(run(files)).toEqual([]);
});
