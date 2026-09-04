// One exact capture target: pages are c0/pN; multi-user contexts are cN/p0.
import type { InstrumentCurrentScope } from "../../_shared/artifact-scope.ts";
import { exactScope } from "../../_shared/artifact-scope.ts";
import type { Args } from "../contract/types.ts";

export function captureScope(opts: Pick<Args, "contexts">, pageIndex: number, window: string): InstrumentCurrentScope {
  return exactScope(opts.contexts > 1 ? pageIndex : 0, opts.contexts > 1 ? 0 : pageIndex, window);
}
