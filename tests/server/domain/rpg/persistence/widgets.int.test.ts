// persistence/widgets — custom HUD widget DEFINITION CRUD (rpg-design/05 §4.1). .int: real FK. Create/list
// (sorted)/update/delete + the binding parse-on-read belt.

import type { RpgWidgetDef } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgHudWidgets } from "@orb/db";
import type { RpgWidgetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { deleteWidget, insertWidget, listWidgets, updateWidget } from "../../../../../packages/server/src/domain/rpg/persistence/widgets";
import { freshDb } from "../../../../support/db";
import { expect, FROZEN_AT, seedChat, seedGame, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const CORRUPT_RE = /rpg_hud_widgets/;

function widgetDef(label: string, sort: number): RpgWidgetDef {
  return { type: "meter", label, icon: null, position: "sidebar", accent: null, sort, binding: { source: "custom", subjectName: null } };
}

describe("CRUD", () => {
  test("insert + list (sorted by sort then id) + update + delete", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    await insertWidget(db, { id: castId<RpgWidgetId>("rpg_widget_2"), gameId, def: widgetDef("second", 2), now: FROZEN_AT });
    await insertWidget(db, { id: castId<RpgWidgetId>("rpg_widget_1"), gameId, def: widgetDef("first", 1), now: FROZEN_AT });

    const listed = await listWidgets(db, gameId);
    expect(listed.map((w) => w.label)).toEqual(["first", "second"]); // sorted by sort

    await updateWidget(db, gameId, castId<RpgWidgetId>("rpg_widget_1"), { label: "renamed" });
    expect((await listWidgets(db, gameId))[0]?.label).toBe("renamed");

    await deleteWidget(db, gameId, castId<RpgWidgetId>("rpg_widget_1"));
    expect(await listWidgets(db, gameId)).toHaveLength(1);
  });
});

describe("parse-on-read corruption belt", () => {
  test("a corrupt binding blob throws RpgStateCorruptError", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    await insertWidget(db, { id: castId<RpgWidgetId>("rpg_widget_1"), gameId, def: widgetDef("w", 0), now: FROZEN_AT });
    await db
      .update(rpgHudWidgets)
      .set({ binding: { source: "nonsense" } as never }) // FABRICATION-OK: invalid-input probe — poisons the binding blob past its schema to prove parse-on-read throws
      .where(eq(rpgHudWidgets.id, castId<RpgWidgetId>("rpg_widget_1")));
    await expect(listWidgets(db, gameId)).rejects.toThrow(CORRUPT_RE);
  });
});
