// What proves a chat send: canon rows that did not exist before it. Retained history, a seeded greeting or an
// earlier reply cannot satisfy a witness, because each read compares against the canon taken before the send.
import type { MessageId } from "@orb/kit/ids";
import type { CanonMessage } from "./trpc.ts";

type WitnessRow = Pick<CanonMessage, "id" | "seq" | "role" | "content">;

function newRows(before: readonly WitnessRow[], after: readonly WitnessRow[]): readonly WitnessRow[] {
  const retained = new Set(before.map((row) => row.id));
  return after.filter((row) => !retained.has(row.id));
}

/** The new user rows carrying exactly `content`, oldest first. */
export function newUserRows(before: readonly WitnessRow[], after: readonly WitnessRow[], content: string): readonly MessageId[] {
  return newRows(before, after)
    .filter((row) => row.role === "user" && row.content === content)
    .map((row) => row.id);
}

/** The send's one user row. No row is a send that never landed; two are a double send, which a witness must not absorb. */
export function soleUserRow(before: readonly WitnessRow[], after: readonly WitnessRow[], content: string): MessageId {
  const [first, ...rest] = newUserRows(before, after, content);
  if (first === undefined) {
    throw new Error(`no new user row carries the sent content: ${content}`);
  }
  if (rest.length > 0) {
    throw new Error(`${String(rest.length + 1)} new user rows carry the sent content, so the composer sent it ${String(rest.length + 1)} times: ${content}`);
  }
  return first;
}

/** The first new non-blank assistant row after the user row `userId`. A group round's later speakers follow it. */
export function newReplyRow(before: readonly WitnessRow[], after: readonly WitnessRow[], userId: MessageId): MessageId | undefined {
  const userSeq = after.find((row) => row.id === userId)?.seq;
  if (userSeq === undefined) {
    return undefined;
  }
  return newRows(before, after).find((row) => row.role === "assistant" && row.seq > userSeq && row.content.trim() !== "")?.id;
}
