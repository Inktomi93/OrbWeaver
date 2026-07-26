// verbs/widget/create-widget — createWidget (rpg-design/05 §4.4, §6.2). Host-gated HUD widget DEFINITION.
// The row is asserted at persistence (assert-the-mutation-fired).

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

describe("createWidget", () => {
  test("the widget definition lands as a row", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    await h.service.createWidget({ principal: principal("host"), chatId, def: DEF });
    expect((await listWidgets(db, gameId)).map((w) => w.label)).toEqual(["Sanity"]);
  });
});
