/** Build one module-local admission pool. A reservation is taken synchronously before the caller's first await;
 *  its release is idempotent so a failed lifecycle cannot hand another runtime an unearned slot. */
export function createAdmission(max: number): () => (() => void) | null {
  let inUse = 0;
  return (): (() => void) | null => {
    if (inUse >= max) {
      return null;
    }
    inUse += 1;
    let released = false;
    return (): void => {
      if (released) {
        return;
      }
      released = true;
      inUse -= 1;
    };
  };
}
