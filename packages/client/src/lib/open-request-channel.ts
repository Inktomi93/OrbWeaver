import { useEffect } from "react";

/** A request to open a surface that a mounted component owns, sent by a control that cannot reach its state: the
 *  overflow menu of a row that moved the inline control out of reach asks the same surface to open. */
export interface OpenRequestChannel<T> {
  readonly request: (value: T) => void;
  readonly subscribe: (listener: (value: T) => void) => () => void;
}

export function createOpenRequestChannel<T = void>(): OpenRequestChannel<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    request: (value): void => {
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

/** The owner's side: handle each request while mounted. */
export function useOpenRequests<T>(channel: OpenRequestChannel<T>, onRequest: (value: T) => void): void {
  useEffect(() => channel.subscribe(onRequest), [channel, onRequest]);
}
