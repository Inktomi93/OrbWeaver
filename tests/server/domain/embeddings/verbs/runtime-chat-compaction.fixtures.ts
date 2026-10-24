// The compaction phases and the turn settlers the compaction runtime suites share.

import { DomainNoCredentialError } from "@orb/kit/errors";
import type { Fixtures } from "@orb/testkit/node";
import { expect } from "@orb/testkit/node";

export const GENERATION_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64, compaction: { mode: "managed", verbatimTail: 8 } } as const;

export const PHASES = ["pre", "post"] as const;
export type SendOutcome = Awaited<ReturnType<Fixtures["app"]["services"]["chat"]["send"]>>;
async function settleRefusedTurn(call: Promise<SendOutcome>): Promise<SendOutcome | null> {
  await expect(call).rejects.toBeInstanceOf(DomainNoCredentialError);
  return null;
}
async function settleCommittedTurn(call: Promise<SendOutcome>): Promise<SendOutcome | null> {
  const committed = await call;
  expect(committed.aborted).toBe(false);
  expect(committed.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(committed.messages.find((message) => message.role === "assistant")?.content).toBe("native funding reply");
  return committed;
}
export const SETTLEMENT: Record<(typeof PHASES)[number], (call: Promise<SendOutcome>) => Promise<SendOutcome | null>> = {
  pre: settleRefusedTurn,
  post: settleCommittedTurn,
};
export const WARNINGS: Record<(typeof PHASES)[number], string> = {
  pre: "chat: pre-turn managed compaction failed (proceeding)",
  post: "chat: managed compaction failed",
};
