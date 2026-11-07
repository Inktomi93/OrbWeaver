// One scripted reply list with one owner. Declare it before the root that spends it, so the check runs after the root settles.

/** A finite plan: `take` refuses past the end, and disposal refuses replies nobody asked for or asked for beyond the end. */
export interface FiniteReplies<Reply> extends Disposable {
  readonly take: () => Reply;
  /** The next reply without spending it, for a script that routes on its shape first. */
  readonly peek: () => Reply | undefined;
}

function replyCount(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

/**
 * Own `replies` for one script, written `using plan = finiteReplies(...)` or passed to a stack's `.use(...)`.
 * A spare reply proves a request that never happened, so an assertion that passes without it fails at disposal. A
 * `take` past the end throws where it is called and again at disposal, so a caller that swallows the refusal still fails.
 *
 * @param label - Names the plan in every refusal.
 */
export function finiteReplies<Reply extends NonNullable<unknown>>(label: string, replies: readonly Reply[]): FiniteReplies<Reply> {
  const pending = [...replies];
  let overdrawn = 0;
  return {
    take: (): Reply => {
      const reply = pending.shift();
      if (reply === undefined) {
        overdrawn += 1;
        throw new Error(`the ${label} reply plan is exhausted`);
      }
      return reply;
    },
    peek: (): Reply | undefined => pending[0],
    [Symbol.dispose]: (): void => {
      if (overdrawn > 0) {
        throw new Error(`the ${label} reply plan was asked for ${replyCount(overdrawn)} beyond the ${replies.length} it scripted`);
      }
      if (pending.length > 0) {
        throw new Error(`the ${label} reply plan left ${pending.length} of ${replies.length} replies unused`);
      }
    },
  };
}
