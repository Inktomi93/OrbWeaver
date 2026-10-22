import type { Db } from "@orb/db";
import type { CharacterService } from "@orb/server/domain/character";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expectTypeOf, test } from "vitest";
import { seedCharacterHistory, seedCreatedCharacter } from "./factories/character.ts";
import { seedCreatedDocument } from "./factories/databank.ts";
import type { ServerTestHarness, UnclaimedServerTestHarness } from "./server.ts";

declare const db: Db;
declare const create: CharacterService["create"];
declare const operations: Pick<CharacterService, "snapshot" | "getSnapshot" | "listSnapshots" | "list">;
declare const createParams: Parameters<CharacterService["create"]>[0];
declare const snapshotParams: Parameters<CharacterService["snapshot"]>[0];
declare const upload: () => ReturnType<ServicesResult["services"]["databank"]["upload"]>;
declare const root: ServerTestHarness;

test("persisted producers refuse caller-supplied business callbacks and structural service bags", async () => {
  // @ts-expect-error — a same-shaped creation callback is not a composed production root.
  await seedCreatedCharacter(db, create, createParams);
  // @ts-expect-error — a same-shaped operation bag is not a composed production root.
  await seedCharacterHistory(db, operations, snapshotParams);
  // @ts-expect-error — an arbitrary document-producing closure is not a native origin.
  await seedCreatedDocument(db, upload);
  // @ts-expect-error — even a genuine root cannot admit a replacement document-producing closure.
  await seedCreatedDocument(root, upload);

  expectTypeOf<Pick<ServerTestHarness, keyof ServerTestHarness>>().not.toExtend<Parameters<typeof seedCreatedCharacter>[0]>();
  expectTypeOf<ServerTestHarness>().toExtend<Parameters<typeof seedCreatedCharacter>[0]>();
  expectTypeOf<UnclaimedServerTestHarness>().toExtend<Parameters<typeof seedCreatedCharacter>[0]>();
});
