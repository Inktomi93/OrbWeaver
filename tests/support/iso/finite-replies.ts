// One scripted reply list with one owner. Declare it before the root that spends it, so the check runs after the root settles.

/** A finite plan: `take` refuses past the end, and disposal refuses replies nobody asked for. */
export interface FiniteReplies<Reply> extends Disposable {
  readonly take: () => Reply;
  /** The next reply without spending it, for a script that routes on its shape first. */
  readonly peek: () => Reply | undefined;
}

/**
 * Own `replies` for one script, written `using plan = finiteReplies(...)` or passed to a stack's `.use(...)`.
 * A spare reply proves a request that never happened, so an assertion that passes without it fails at disposal.
 *
 * @param label - Names the plan in both refusals.
 */
export function finiteReplies<Reply extends NonNullable<unknown>>(label: string, replies: readonly Reply[]): FiniteReplies<Reply> {
  const pending = [...replies];
  return {
    take: (): Reply => {
      const reply = pending.shift();
      if (reply === undefined) {
        throw new Error(`the ${label} reply plan is exhausted`);
      }
      return reply;
    },
    peek: (): Reply | undefined => pending[0],
    [Symbol.dispose]: (): void => {
      if (pending.length > 0) {
        throw new Error(`the ${label} reply plan left ${pending.length} of ${replies.length} replies unused`);
      }
    },
  };
}
