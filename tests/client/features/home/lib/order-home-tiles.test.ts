// orderHomeTiles — the home grid's TOTAL order. What matters is that it is total: an omitted `order`
// still sorts deterministically, and two tiles sharing an `order` break the tie on `id` rather than
// inheriting the door's array order (which would make the grid depend on import order at main.tsx).

import type { HomeTileContribution } from "@orb/client/lib";
import { Clock } from "@orb/ui/icons";
import { orderHomeTiles } from "../../../../../packages/client/src/features/home/lib/order-home-tiles.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function tile(id: string, order?: number): HomeTileContribution {
  return { id, title: id, icon: Clock, body: () => null, ...(order === undefined ? {} : { order }) };
}

const ids = (tiles: readonly HomeTileContribution[]): string[] => tiles.map((t) => t.id);

test("sorts by `order` ascending regardless of door-array order", () => {
  expect(ids(orderHomeTiles([tile("c", 30), tile("a", 10), tile("b", 20)]))).toEqual(["a", "b", "c"]);
});

test("ties on `order` break on `id`, so the grid never depends on main.tsx import order", () => {
  expect(ids(orderHomeTiles([tile("z", 10), tile("m", 10), tile("a", 10)]))).toEqual(["a", "m", "z"]);
});

test("an omitted `order` sorts as 0 — an unordered tile leads, deterministically", () => {
  expect(ids(orderHomeTiles([tile("late", 10), tile("plain")]))).toEqual(["plain", "late"]);
});
