import type { RegexContext } from "#src/domain/regex/context.ts";
import type { RegexService } from "#src/domain/regex/contract/service.ts";
import { countOwnedScripts } from "#src/domain/regex/persistence/queries.ts";

export function createCount(ctx: RegexContext): RegexService["countScripts"] {
  return async ({ principal }) => await countOwnedScripts(ctx.db, principal.userId);
}
