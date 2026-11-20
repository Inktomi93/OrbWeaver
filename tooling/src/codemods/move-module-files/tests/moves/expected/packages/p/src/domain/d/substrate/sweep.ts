import type { Row } from "#src/domain/d/contract/rows.ts";
import { selectRow } from "#src/domain/d/persistence/queries.ts";
import { pureRule } from "#src/domain/d/substrate/pure.ts";

export async function sweep(id: string): Promise<Row | undefined> {
  return pureRule(await selectRow(id));
}
