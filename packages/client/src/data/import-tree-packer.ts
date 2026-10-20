// data/import-tree-packer — the greedy upload packing `import-tree-plan.ts` runs over its planned files.

/** Greedy packing of units (each a file list) under the caps, `always` riding in every upload. A unit that
 *  does not fit beside others starts a fresh upload; a unit over the cap on its own is split at file
 *  boundaries with its `repeat` files (a card, a group's definition and members) carried into each part. */
export class UploadPacker<T extends { readonly file: File }> {
  readonly batches: File[][] = [];
  private readonly caps: { readonly totalBytes: number; readonly files: number };
  private readonly always: readonly T[];
  private readonly alwaysBytes: number;
  private current: T[] = [];
  private currentBytes = 0;
  private inCurrent = new Set<T>();

  constructor(caps: { readonly totalBytes: number; readonly files: number }, always: readonly T[]) {
    this.caps = caps;
    this.always = always;
    this.alwaysBytes = always.reduce((n, f) => n + f.file.size, 0);
  }

  private fits(extraBytes: number, extraFiles: number): boolean {
    return this.currentBytes + extraBytes <= this.caps.totalBytes && this.current.length + extraFiles <= this.caps.files;
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
        this.currentBytes += f.file.size;
      }
    }
  }

  /** Add one unit; `repeat` is the part of it every split must carry. */
  add(repeat: readonly T[], rest: readonly T[]): void {
    const unit = [...repeat, ...rest];
    const bytes = unit.reduce((n, f) => n + f.file.size, 0);
    if (this.current.length === 0) {
      this.open();
    }
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    this.flush();
    this.open();
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    // Over the cap on its own: split `rest` across uploads, each carrying `repeat`.
    this.push(repeat);
    for (const file of rest) {
      if (!this.fits(file.file.size, 1)) {
        this.flush();
        this.open();
        this.push(repeat);
      }
      this.push([file]);
    }
  }

  finish(): File[][] {
    this.flush();
    return this.batches;
  }
}
