// Gate: handle-key-writer (D257) — a drizzle users write whose literal data sets `handle` without `handleKey` is
// red: an update without it keeps a stale key that admits a look-alike of the new handle. DECLARED LIMITS: data
// the reader cannot see (a variable, a spread) is `external-id-single-writer`'s opaque-data arm; the
// `insertUser`/`updateUser` verbs derive the key. FAMILY: external-id-single-writer, via `usersDrizzleWrite` in
// tooling/src/verify/lib/external-id-writer.ts. POPULATION: @server, where every users writer lives; new policy.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { usersDrizzleWrite } from "../lib/external-id-writer.ts";

const HANDLE = "handle";
const HANDLE_KEY = "handleKey";

const MESSAGE =
  "a users write that sets `handle` without `handleKey` (D257): the key is the comparison every handle writer checks, so an update without it keeps the old key and admits a look-alike of the new handle. See docs/adr/0257-handles-compare-on-one-unicode-key.md.";
const FIX =
  "write the handle through the sessions persistence verbs (`insertUser`, `updateUser`, or a statement in sessions/persistence/users.ts), which derive `handleKey` with `handleKey()` from @orb/kit/handle-key.";

// The property named `name` in a literal, as written (plain, quoted or shorthand).
function propertyNamed(data: Node, name: string): Node | undefined {
  if (!data.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return;
  }
  return data
    .getProperties()
    .find(
      (property) =>
        (property.isKind(SyntaxKind.PropertyAssignment) || property.isKind(SyntaxKind.ShorthandPropertyAssignment)) &&
        property.getNameNode().getText().replace(/["']/gu, "") === name,
    );
}

export const gate = defineGate({
  id: "handle-key-writer",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          const data = usersDrizzleWrite(node)?.data;
          const handle = data === undefined ? undefined : propertyNamed(data, HANDLE);
          if (data === undefined || handle === undefined || propertyNamed(data, HANDLE_KEY) !== undefined) {
            return;
          }
          const nameNode =
            handle.isKind(SyntaxKind.PropertyAssignment) || handle.isKind(SyntaxKind.ShorthandPropertyAssignment) ? handle.getNameNode() : handle;
          ctx.report.node(nameNode, { token: nameNode.getText(), offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/entry/boot/seed-owner.ts":
          'import { users } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport const rename = (db: DB, id: string, handle: H, at: number) => db.update(users).set({ handle, updatedAt: at }).where(eq(users.id, id));\n',
      },
      expect: { count: 1, token: "handle" },
      why: "an UPDATE that renames without the key: the row keeps its old key, so a look-alike of the new handle is admitted beside it, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/admin/verbs/rename.ts":
          'import { users } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport const rename = (db: DB, id: string, next: H) => db["update"](users)["set"]({ "handle": next }).where(eq(users.id, id));\n',
      },
      expect: { count: 1, token: '"handle"' },
      why: "the bracket and quoted-key spelling of the same rename, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const mint = (db: DB, id: string, handle: H, at: number) => db.insert(users).values({ id, handle, role: "user", createdAt: at, updatedAt: at });\n',
      },
      expect: { count: 1, token: "handle" },
      why: "an INSERT without the key, even in the persistence home: the home's statements must write it too, RED",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { handleKey } from "@orb/kit/handle-key";\nimport { users } from "@orb/db";\n' +
          "export const mint = (db: DB, id: string, handle: H, at: number) => db.insert(users).values({ id, handle, handleKey: handleKey(handle), createdAt: at, updatedAt: at });\n",
      },
      why: "a users insert that writes the key beside the handle, passes. Drop the key-present check and this reds",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/rename.ts":
          'import { updateUser } from "../persistence/users.ts";\nexport const rename = (db: DB, id: string, handle: H, at: number) => updateUser(db, id, { handle, updatedAt: at });\n',
      },
      why: "the persistence verb `updateUser` derives the key itself, so its caller writes only the handle, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/character/verbs/rename.ts":
          'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport const rename = (db: DB, id: string, handle: H) => db.update(characters).set({ handle }).where(eq(characters.id, id));\n',
      },
      why: "a `handle` column on another table (a character card slug) is not a users handle, passes. Drop the users-table check and this reds",
    },
  ],
});
