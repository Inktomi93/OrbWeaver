import { DomainInternalFaultError, DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";
import type { AssetId } from "@orb/kit/ids";

/** The stored file of an asset row is gone (`cas.read` ENOENT). The sweep fails that asset alone; nothing else
 *  that goes wrong while indexing it is this error. */
export class AssetFileMissingError extends DomainUnavailableError {
  readonly assetId: AssetId;
  constructor(assetId: AssetId, options?: { readonly cause?: unknown }) {
    super(`embeddings: the stored file of asset ${assetId} is missing`);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    this.assetId = assetId;
  }
}

/** The stored file of an asset row is not an image: its bytes carry no known image signature (truncated or
 *  corrupt). The sweep fails that asset alone, like {@link AssetFileMissingError}. */
export class AssetFileCorruptError extends DomainOperationError {
  readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset_file_corrupt", `embeddings: the stored file of asset ${assetId} is not a readable image`);
    this.assetId = assetId;
  }
}

/** A genuine producer failure: the caller decides retry vs skip; store never silently writes a null vector. A
 *  route that lets it escape answers SERVICE_UNAVAILABLE, because the embedder gave nothing to store. The message
 *  reaches the client, so the lens and the model stay in the fields and in the producer's log record. */
export class EmbedFailedError extends DomainUnavailableError {
  readonly lens: string;
  readonly model: string;
  constructor(lens: string, model: string) {
    super("The embedder could not produce a vector for this input. Try again in a moment.");
    this.lens = lens;
    this.model = model;
  }
}

/** Store-time space tripwire: throwing here stops a mis-tagged row from ever landing, so search/memory
 *  never compare across spaces by accident. */
export class SpaceMismatchError extends DomainInternalFaultError {
  readonly model: string;
  readonly expectedDim: number;
  readonly actualDim: number;
  constructor(model: string, expectedDim: number, actualDim: number) {
    super(`embeddings.store: vector dim mismatch for model '${model}' — declared space dim ${expectedDim}, embedder returned ${actualDim}`);
    this.model = model;
    this.expectedDim = expectedDim;
    this.actualDim = actualDim;
  }
}
