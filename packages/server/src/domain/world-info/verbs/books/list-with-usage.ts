// verb: listBooksWithUsage — every owned book plus the two DERIVED numbers its library row states: how many
// entries it holds, and where it fires (the four-scope attachment rollup). The Configuration workspace's
// roster read. A read: no audit.
//
// WHY A SECOND LIST VERB rather than fields on `listBooks`: `listBooks` is the picker read (persona lorebook
// select, character relations, the attach dialogs) and it is on hot paths that want the row and nothing else.
// This one pays five extra GROUP BYs to answer "42 entries · attached ×3", which only the roster asks.
//
// THE PATTERN, COUNTED: this is the SECOND instance of the with-usage reverse-rollup (`tag.listTagsWithUsage`
// was the first); the queued REGROSTER small (regex "attached by" rosters) would be the third. Three
// instances is when a shared substrate earns its keep — flag it there, do not generalize off two.

import type { WorldInfoContext } from "../../context.ts";
import type { ListBooksParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listOwnedBooksWithUsage } from "../../persistence/queries.ts";

export function createListWithUsage(ctx: WorldInfoContext): WorldInfoService["listBooksWithUsage"] {
  return ({ principal }: ListBooksParams) => listOwnedBooksWithUsage(ctx.db, principal.userId);
}
