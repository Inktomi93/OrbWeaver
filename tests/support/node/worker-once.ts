// A worker builds a shared input once, under isolate:false, for every root that follows. A build that fails is
// forgotten, so one transient failure reds only the root that met it and the next root builds again.

export interface WorkerOnce<T> {
  readonly read: () => Promise<T>;
  /** Drop the kept build and make the next one reject with `error`, so a case can show that the build after it runs. */
  readonly __failNextForTest: (error: Error) => void;
}

export function workerOnce<T>(build: () => Promise<T>): WorkerOnce<T> {
  let kept: Promise<T> | undefined;
  let planted: Error | undefined;
  const run = (): Promise<T> => {
    const failure = planted;
    planted = undefined;
    return failure === undefined ? build() : Promise.reject(failure);
  };
  return {
    read: (): Promise<T> => {
      kept ??= run().catch((error: unknown) => {
        kept = undefined;
        throw error;
      });
      return kept;
    },
    __failNextForTest: (error): void => {
      kept = undefined;
      planted = error;
    },
  };
}
