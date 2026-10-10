import type { RegexContext } from "../../context.ts";
import type { RegexService } from "../../contract/service.ts";
import { countOwnedScripts } from "../../persistence/queries.ts";

export function createCount(ctx: RegexContext): RegexService["countScripts"] {
  return async ({ principal }) => await countOwnedScripts(ctx.db, principal.userId);
}
