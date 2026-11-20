import type { Row } from "../contract/rows.ts";
import { selectRow } from "../persistence/queries.ts";
import { pureRule } from "./pure.ts";
import { tick } from "./loop.ts";
import { kit } from "@orb/kit/ids";

export async function loadDecided(id: string): Promise<Row | undefined> {
  tick(kit);
  return pureRule(await selectRow(id));
}
