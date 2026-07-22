// runner: expressions-sprite-sheet — the sprite-sheet generation pass (D49 #4; expressions-design/03 §3.3).
// Thin, per the runner-env law: it delegates the whole bulk pass to `ctx.env.expressions.runSpriteSheetJob`,
// whose implementation lives in `domain/expressions` (imagery generate → sharp grid-slice → matte → assets
// store → `character_sprites` rows). The runner never reaches another domain's db; the pass reports progress,
// throws on failure (→ failed, atomic-last so zero rows are written), and honors the AbortSignal (→ cancelled).

import type { Runner } from "../contract/runner";

export const expressionsSpriteSheetRunner: Runner<"expressions-sprite-sheet"> = (ctx, params, report, signal) =>
  ctx.env.expressions.runSpriteSheetJob(params, report, signal);
