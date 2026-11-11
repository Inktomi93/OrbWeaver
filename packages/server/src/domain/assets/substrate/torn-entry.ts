// A torn CAS entry: the asset row stands, its stored bytes are gone. Every reader answers it with the same not-found a
// foreign or absent asset gets, so the answer is no existence oracle, and the fault goes to the log instead.

import type { UserId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { isMissingFile } from "#primitives/errno";

/** The entry a torn read names in its log line: an asset by id, or an owner's blob by content hash. */
export type TornEntryRef = { readonly assetId: string } | { readonly ownerId: UserId; readonly hash: string };

/**
 * Run a CAS-backed `read`, answering `null` when its entry is torn. A torn entry is exactly a missing file, because the
 * CAS read is a bare file read; every other fault is not a miss and rejects as itself.
 */
export async function readTornAsMiss<T>(logger: Logger, ref: TornEntryRef, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    getLog(logger).warn({ err: error, ...ref }, "assets: a stored asset's bytes are missing, so the read answers not found");
    return null;
  }
}
