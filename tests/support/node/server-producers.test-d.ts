import type { Db } from "@orb/db";
import type { CharacterService } from "@orb/server/domain/character";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expectTypeOf, test } from "vitest";
import { seedCharacterHistoryRows } from "./factories/rows/character.ts";
import { seedCreatedDocumentRows } from "./factories/rows/databank.ts";
import { seedCharacterRows } from "./factories/rows.ts";
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
  await seedCharacterRows(db, create, createParams);
  // @ts-expect-error — a same-shaped operation bag is not a composed production root.
  await seedCharacterHistoryRows(db, operations, snapshotParams);
  // @ts-expect-error — an arbitrary document-producing closure is not a native origin.
  await seedCreatedDocumentRows(db, upload);
  // @ts-expect-error — even a genuine root cannot admit a replacement document-producing closure.
  await seedCreatedDocumentRows(root, upload);

  expectTypeOf<Pick<ServerTestHarness, keyof ServerTestHarness>>().not.toExtend<Parameters<typeof seedCharacterRows>[0]>();
  expectTypeOf<ServerTestHarness>().toExtend<Parameters<typeof seedCharacterRows>[0]>();
  expectTypeOf<UnclaimedServerTestHarness>().toExtend<Parameters<typeof seedCharacterRows>[0]>();
});
