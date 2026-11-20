import type { Row } from "../contract/rows.ts";
import { selectRow } from "../persistence/queries.ts";
import { pureRule } from "./pure.ts";

export async function sweep(id: string): Promise<Row | undefined> {
  return pureRule(await selectRow(id));
}
