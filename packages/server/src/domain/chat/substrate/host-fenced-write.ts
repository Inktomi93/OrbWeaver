// domain/chat/substrate/host-fenced-write — the ONE spelling of "commit these chat statements WITH the
// room host's stats-canon bump". Four verbs had hand-rolled the same three steps (#1767: jscpd found the
// chat-lifecycle↔turn pair; a `hostUserIdOf(await loadParticipants(…))` grep finds the other two) — resolve
// the room's host off the participant rows, bump the stats canon version onto the statement list when there
// IS a host, then run the whole list as one batch.
//
// WHY IT IS A FOLD AND NOT A RECORDED TWIN: the middle step is a CORRECTNESS step, not a formatting one. The
// bump is what invalidates the host's cached stats canon after a canon-shaped write, so a fifth site that
// spells the first and third lines and forgets the second writes canon the stats reads keep serving stale —
// silently, with no test of its own able to see it. One home makes forgetting it impossible; that is the
// same reason `hostUserIdOf` (the lookup this composes) exists one file over.
//
// HOSTLESS IS A NO-OP, NOT A REFUSAL. An archived orphan or a racing delete answers `null`, and the write
// still commits: the bump has no owner to credit, and refusing the write would turn a stats-cache concern
// into a canon-write failure. Callers that genuinely REQUIRE a host (`generateImage` needs an owner for the
// committed message's economics) keep their own explicit throw — they are asking a different question and
// deliberately do not take this door.

import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "./participants-host.ts";

/** Append the room host's stats-canon bump to `statements` and commit them in ONE batch, returning the
 *  batch's results so a caller can read its own RETURNING rows (the rpg-pointer guard reads `results[0]` to
 *  tell "the guarded update matched nothing" from "the chat is gone"). Hostless ⇒ the bump is skipped and
 *  the statements still commit (see the file header). */
export async function commitHostFencedWrite(ctx: ChatContext, chatId: ChatId, statements: BatchStmt[]): Promise<readonly unknown[]> {
  const hostUserId = hostUserIdOf(await loadParticipants(ctx.db, chatId));
  if (hostUserId !== null) {
    ctx.bumpStatsCanonVersion(statements, ctx.db, hostUserId);
  }
  return await ctx.db.batch(batchMany(statements));
}
