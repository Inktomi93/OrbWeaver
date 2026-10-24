// data/import-tree-packer — the greedy upload packing `import-tree-plan.ts` runs over its planned files.

/** What one upload may carry: the body bytes left after its per-upload framing, and its file count. */
interface UploadBudget {
  readonly totalBytes: number;
  readonly files: number;
}

/** Greedy packing of units (each a file list) under the budget, `always` riding in every upload. A file costs
 *  what its upload body grows by (`cost`). A unit that does not fit beside others starts a fresh upload; a unit
 *  over the budget on its own is split at file boundaries with its `repeat` files (a card, a group's definition
 *  and members) carried into each part. A file no fresh upload can carry is rejected, never sent alone. */
export class UploadPacker<T extends { readonly file: File }> {
  private readonly batches: File[][] = [];
  private readonly rejected: T[] = [];
  private readonly budget: UploadBudget;
  private readonly always: readonly T[];
  private readonly cost: (f: T) => number;
  private readonly alwaysBytes: number;
  private current: T[] = [];
  private currentBytes = 0;
  private inCurrent = new Set<T>();

  /** @throws Error when the budget cannot carry the `always` files plus any other byte. */
  constructor(budget: UploadBudget, always: readonly T[], cost: (f: T) => number) {
    this.budget = budget;
    this.always = always;
    this.cost = cost;
    this.alwaysBytes = this.costOf(always);
    if (this.alwaysBytes >= budget.totalBytes || always.length >= budget.files) {
      throw new Error("The folder upload size cap leaves no room for any file once each upload's framing is counted");
    }
  }

  private costOf(files: readonly T[]): number {
    return files.reduce((n, f) => n + this.cost(f), 0);
  }

  private fits(extraBytes: number, extraFiles: number): boolean {
    return this.currentBytes + extraBytes <= this.budget.totalBytes && this.current.length + extraFiles <= this.budget.files;
  }

  private fitsFresh(extraBytes: number, extraFiles: number): boolean {
    return this.alwaysBytes + extraBytes <= this.budget.totalBytes && this.always.length + extraFiles <= this.budget.files;
  }

  private open(): void {
    this.current = [...this.always];
    this.inCurrent = new Set(this.always);
    this.currentBytes = this.alwaysBytes;
  }

  private flush(): void {
    if (this.current.length > this.always.length) {
      this.batches.push(this.current.map((f) => f.file));
    }
    this.current = [];
    this.inCurrent = new Set();
    this.currentBytes = 0;
  }

  /** Append the files not already in this upload — a group's member card repeats a bundle's card. */
  private push(files: readonly T[]): void {
    for (const f of files) {
      if (!this.inCurrent.has(f)) {
        this.inCurrent.add(f);
        this.current.push(f);
        this.currentBytes += this.cost(f);
      }
    }
  }

  /** Add one unit; `repeat` is the part of it every split must carry. */
  add(repeat: readonly T[], rest: readonly T[]): void {
    const unit = [...repeat, ...rest];
    const bytes = this.costOf(unit);
    if (this.current.length === 0) {
      this.open();
    }
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    const repeatBytes = this.costOf(repeat);
    if (!this.fitsFresh(repeatBytes, repeat.length)) {
      this.rejected.push(...unit);
      return;
    }
    this.flush();
    this.open();
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    // Over the budget on its own: split `rest` across uploads, each carrying `repeat`.
    this.push(repeat);
    for (const file of rest) {
      if (!this.fitsFresh(repeatBytes + this.cost(file), repeat.length + 1)) {
        this.rejected.push(file);
        continue;
      }
      if (!this.fits(this.cost(file), 1)) {
        this.flush();
        this.open();
        this.push(repeat);
      }
      this.push([file]);
    }
  }

  /** The uploads in send order, and every rejected file no upload carries (a rejected group member card may
   *  still travel in its own bundle's upload). */
  finish(): { readonly batches: readonly (readonly File[])[]; readonly rejected: readonly T[] } {
    this.flush();
    const sent = new Set(this.batches.flat());
    return { batches: this.batches, rejected: [...new Set(this.rejected)].filter((f) => !sent.has(f.file)) };
  }
}
