import type { Row } from "../contract/rows.ts";
import { selectRow } from "./queries.ts";
import { pureRule } from "../substrate/pure.ts";
import { tick } from "../engine/loop.ts";
import { kit } from "@orb/kit/ids";

export async function loadDecided(id: string): Promise<Row | undefined> {
  tick(kit);
  return pureRule(await selectRow(id));
}
