import type { AssetId } from "@orb/kit/ids";

/** The stored file of an asset row is gone (`cas.read` ENOENT). The sweep fails that asset alone; nothing else
 *  that goes wrong while indexing it is this error. */
export class AssetFileMissingError extends Error {
  readonly assetId: AssetId;
  constructor(assetId: AssetId, options?: ErrorOptions) {
    super(`embeddings: the stored file of asset ${assetId} is missing`, options);
    this.name = "AssetFileMissingError";
    this.assetId = assetId;
  }
}

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
