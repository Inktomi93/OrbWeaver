// The in-process publish/subscribe engine: a closure-scoped subscriber set and a fan-out that hands each
// subscriber to an injected `dispatch`. The caller owns delivery semantics (detached, supervised, error-isolated)
// through `dispatch`; this engine only owns the set and the one-handler-per-call fan-out.

/** A subscriber. A returned promise is the dispatcher's to observe. */
export type PubSubHandler<E> = (event: E) => void | Promise<void>;

/** The bus surface: `emit` fans an event to every current subscriber; `subscribe` returns its own teardown. */
export interface PubSub<E> {
  readonly emit: (event: E) => void;
  readonly subscribe: (handler: PubSubHandler<E>) => () => void;
}

/** Build a bus whose `emit` calls `dispatch(handler, event)` once per subscriber present at emit time. */
export function createPubSub<E>(dispatch: (handler: PubSubHandler<E>, event: E) => void): PubSub<E> {
  const handlers = new Set<PubSubHandler<E>>();
  return {
    subscribe: (handler): (() => void) => {
      handlers.add(handler);
      return (): void => {
        handlers.delete(handler);
      };
    },
    emit: (event): void => {
      for (const handler of handlers) {
        dispatch(handler, event);
      }
    },
  };
}
