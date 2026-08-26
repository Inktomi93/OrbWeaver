import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

function findings(): readonly Finding[] {
  const { project, root } = ctxFor({
    "packages/db/src/schema/persona.ts": 'export const personas = sqliteTable("personas", { id: text("id"), ownerId: text("owner_id") });\n',
    "packages/server/src/entry/compose/chat.ts":
      'import { personas } from "@orb/db";\nexport const verifyPersonaOwned = async ({ ownerId, personaId }) => {\n  const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);\n  return rows[0]?.ownerId === ownerId;\n};\n',
  });
  return (
    runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    }).gates[0]?.findings ?? []
  );
}

test("a verifier may return the exact fetched owner relationship", () => {
  expect(findings()).toEqual([]);
});
