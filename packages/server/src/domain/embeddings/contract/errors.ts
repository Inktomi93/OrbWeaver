// domain/embeddings/contract/errors — the typed domain errors the store path throws.

/** The injected embed/imageEmbed op produced no usable vector for the input (a `null` entry — the family
 *  filtered an empty/whitespace input — or an empty vectors array). A genuine producer failure: the caller
 *  (the indexer / a re-index workload) decides retry vs skip; `store` never silently writes a null vector. */
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

/** The store-time SPACE tripwire: the produced vector's dimension does not match the declared `(model, dim)`
 *  space (the embed backend returned a wrong-width vector — a silent embedder/quant swap). Throwing here
 *  STOPS a mis-tagged row from ever landing, so `search`/`memory` never compare across spaces by accident
 *  (the complementary compare-time tripwire is `@orb/kit/vector-math`'s dim-mismatch throw). */
export class SpaceMismatchError extends Error {
  readonly model: string;
  readonly expectedDim: number;
  readonly actualDim: number;
  constructor(model: string, expectedDim: number, actualDim: number) {
    super(
      `embeddings.store: vector dim mismatch for model '${model}' — declared space dim ${expectedDim}, embedder returned ${actualDim}`,
    );
    this.name = "SpaceMismatchError";
    this.model = model;
    this.expectedDim = expectedDim;
    this.actualDim = actualDim;
  }
}
