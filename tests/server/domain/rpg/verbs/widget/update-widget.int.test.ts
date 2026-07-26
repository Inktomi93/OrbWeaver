// verbs/widget/update-widget — updateWidget (rpg-design/05 §4.4, §6.2). Host-gated, game-scoped. Asserted at
// the persisted row.

import type { RpgWidgetDef } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { listWidgets } from "../../../../../../packages/server/src/domain/rpg/persistence/widgets";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

const DEF: RpgWidgetDef = {
  type: "meter",
  label: "Sanity",
  icon: null,
  position: "sidebar",
  accent: null,
  sort: 0,
  binding: { source: "custom", subjectName: null },
};

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("updateWidget", () => {
  test("patches the widget label at the row", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const widgetId = await h.service.createWidget({ principal: principal("host"), chatId, def: DEF });
    await h.service.updateWidget({ principal: principal("host"), chatId, widgetId, patch: { label: "Madness" } });
    expect((await listWidgets(db, gameId))[0]?.label).toBe("Madness");
  });
});
