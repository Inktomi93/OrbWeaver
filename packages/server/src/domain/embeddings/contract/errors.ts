/** A genuine producer failure: the caller decides retry vs skip; store never silently writes a null vector. */
export class EmbedFailedError extends Error {
  readonly lens: string;
  readonly model: string;
  constructor(lens: string, model: string) {
    super(`embeddings.store: embed produced no vector for lens '${lens}' (model '${model}')`);
    this.name = "EmbedFailedError";
    this.lens = lens;
    this.model = model;
  }
}

/** Store-time space tripwire: throwing here stops a mis-tagged row from ever landing, so search/memory
 *  never compare across spaces by accident. */
export class SpaceMismatchError extends Error {
  readonly model: string;
  readonly expectedDim: number;
  readonly actualDim: number;
  constructor(model: string, expectedDim: number, actualDim: number) {
    super(`embeddings.store: vector dim mismatch for model '${model}' — declared space dim ${expectedDim}, embedder returned ${actualDim}`);
    this.name = "SpaceMismatchError";
    this.model = model;
    this.expectedDim = expectedDim;
    this.actualDim = actualDim;
  }
}
