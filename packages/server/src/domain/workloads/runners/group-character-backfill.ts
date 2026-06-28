// runner: group-character-backfill — INERT P5 stub. FLAG[PD-41]: the synthetic group-character mint
// body → domain/character when the group chat / memory build lands (D38 P5 seam). Exists so
// `exhaustive-dispatch` stays green; returns a `DeferredResult`. The `ctx.env.character` seam is declared
// (contract/runner-env); it is wired + called in P5 (the real runner short-circuits on a stored
// groupCharacterId — idempotent — when its body lands).

import type { Runner } from "../contract/runner";

export const groupCharacterBackfillRunner: Runner<"group-character-backfill"> = (
  _ctx,
  _params,
  report,
  _signal,
) => {
  report({ message: "group-character backfill deferred to P5 (no-op)" });
  return Promise.resolve({ deferred: true });
};
