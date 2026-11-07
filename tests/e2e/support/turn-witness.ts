// What proves a chat send: canon rows that did not exist before it. Retained history, a seeded greeting or an
// earlier reply cannot satisfy a witness, because each read compares against the canon taken before the send.
import type { MessageId } from "@orb/kit/ids";
import type { CanonMessage } from "./trpc.ts";

type WitnessRow = Pick<CanonMessage, "id" | "seq" | "role" | "content">;

function newRows(before: readonly WitnessRow[], after: readonly WitnessRow[]): readonly WitnessRow[] {
  const retained = new Set(before.map((row) => row.id));
  return after.filter((row) => !retained.has(row.id));
}

/** The one new user row carrying exactly `content`. Two such rows are a double send, not a witness. */
export function newUserRow(before: readonly WitnessRow[], after: readonly WitnessRow[], content: string): MessageId | undefined {
  const matches = newRows(before, after).filter((row) => row.role === "user" && row.content === content);
  return matches.length === 1 ? matches[0]?.id : undefined;
}

/** The first new non-blank assistant row after the user row `userId`. A group round's later speakers follow it. */
export function newReplyRow(before: readonly WitnessRow[], after: readonly WitnessRow[], userId: MessageId): MessageId | undefined {
  const userSeq = after.find((row) => row.id === userId)?.seq;
  if (userSeq === undefined) {
    return undefined;
  }
  return newRows(before, after).find((row) => row.role === "assistant" && row.seq > userSeq && row.content.trim() !== "")?.id;
}
