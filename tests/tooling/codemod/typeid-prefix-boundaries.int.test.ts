import { migrateTypeIdBoundarySchemas } from "../../../scripts/codemods/typeid-prefix-boundaries.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { withTree } from "./_kit-tree.ts";

const IDS = `
declare const brand: unique symbol;
export type Branded<B extends string> = string & { readonly [brand]: B };
export type TypeIdOf<P extends string> = Branded<P>;
export const ID_PREFIX = { chat: "chat", persona: "persona" } as const;
export type ChatId = TypeIdOf<"chat">;
export type PersonaId = TypeIdOf<"persona">;
export type UserId = Branded<"UserId">;
export function brandedId<T extends Branded<string>>(): T { return "" as T; }
export function typeIdSchema<P extends string>(_prefix: P): TypeIdOf<P> { return "" as TypeIdOf<P>; }
`;

function runMigration(ctx: Parameters<typeof migrateTypeIdBoundarySchemas>[0]): void {
  ctx.plan(migrateTypeIdBoundarySchemas(ctx));
}

test("checker-resolved TypeIDs migrate through a renamed barrel while prefixless brands and imports stay honest", async () => {
  await withTree(
    {
      "packages/kit/src/ids/index.ts": IDS,
      "packages/server/src/id-door.ts": 'export { brandedId, type ChatId as RoomId, type UserId } from "../../kit/src/ids/index.ts";\n',
      "packages/server/src/barrel-subject.ts":
        'import { brandedId as brand, type RoomId, type UserId } from "./id-door.ts";\nexport const room = brand<RoomId>();\nexport const user = brand<UserId>();\n',
      "packages/server/src/direct-subject.ts":
        'import { brandedId, type ChatId } from "../../kit/src/ids/index.ts";\nexport const room = brandedId<ChatId>();\n',
    },
    async ({ read, run }) => {
      const first = await run(runMigration, { apply: true });

      expect(first.output).toContain(
        "TypeID denominator: 3 canonical brandedId call(s) = 2 TypeID replacement(s) + 1 preserved prefixless brand(s); 0 refusal(s).",
      );
      expect(read("packages/server/src/barrel-subject.ts")).toContain("typeIdSchema(ID_PREFIX.chat)");
      expect(read("packages/server/src/barrel-subject.ts")).toContain("brand<UserId>()");
      expect(read("packages/server/src/barrel-subject.ts")).toContain('from "@orb/kit/ids"');
      expect(read("packages/server/src/barrel-subject.ts")).toContain("brandedId as brand");
      expect(read("packages/server/src/barrel-subject.ts")).not.toContain("RoomId");
      expect(read("packages/server/src/direct-subject.ts")).toContain("typeIdSchema(ID_PREFIX.chat)");
      expect(read("packages/server/src/direct-subject.ts")).not.toContain("brandedId");
      expect(read("packages/server/src/direct-subject.ts")).not.toContain("ChatId");

      const second = await run(runMigration, { apply: true });
      expect(second.result.filesChanged).toBe(0);
      expect(second.output).toContain("1 canonical brandedId call(s) = 0 TypeID replacement(s) + 1 preserved prefixless brand(s); 0 refusal(s)");
    },
  );
});

test("a proven local same-named helper is foreign and remains untouched", async () => {
  const subject =
    'import type { ChatId } from "../../kit/src/ids/index.ts";\nfunction brandedId<T>(): T { throw new Error(); }\nexport const room = brandedId<ChatId>();\n';
  await withTree({ "packages/kit/src/ids/index.ts": IDS, "packages/server/src/local.ts": subject }, async ({ read, run }) => {
    const result = await run(runMigration, { apply: true });
    expect(result.result.filesChanged).toBe(0);
    expect(read("packages/server/src/local.ts")).toBe(subject);
  });
});

test("an unreadable brandedId import refuses before any bytes are written", async () => {
  const subject =
    'import type { ChatId } from "../../kit/src/ids/index.ts";\nimport { brandedId } from "./missing.ts";\nexport const room = brandedId<ChatId>();\n';
  await withTree({ "packages/kit/src/ids/index.ts": IDS, "packages/server/src/unreadable.ts": subject }, async ({ read, run }) => {
    await expect(run(runMigration, { apply: true })).rejects.toThrow("TypeID migration refused 1 site(s)");
    expect(read("packages/server/src/unreadable.ts")).toBe(subject);
  });
});

test("an ambiguous TypeID union refuses instead of choosing one prefix", async () => {
  const subject =
    'import { brandedId, type ChatId, type PersonaId } from "../../kit/src/ids/index.ts";\nexport const room = brandedId<ChatId | PersonaId>();\n';
  await withTree({ "packages/kit/src/ids/index.ts": IDS, "packages/server/src/ambiguous.ts": subject }, async ({ read, run }) => {
    await expect(run(runMigration, { apply: true })).rejects.toThrow("ambiguous/non-literal brand");
    expect(read("packages/server/src/ambiguous.ts")).toBe(subject);
  });
});
