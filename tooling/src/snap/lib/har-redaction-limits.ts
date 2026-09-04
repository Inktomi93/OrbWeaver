// Policy normalization is separate so the disk-safety door stays below the tooling file cap.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { NetworkEvidenceLimits } from "../contract/har-redaction.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const DEFAULT_LIMITS: NetworkEvidenceLimits = {
  maxDepth: 8,
  maxFields: 512,
  maxStringBytes: 4096,
  maxBodyBytes: 16_384,
  maxEntries: 256,
  maxUrlBytes: 8192,
};
const HARD_LIMITS: NetworkEvidenceLimits = {
  maxDepth: 32,
  maxFields: 4096,
  maxStringBytes: 65_536,
  maxBodyBytes: 1_048_576,
  maxEntries: 2048,
  maxUrlBytes: 65_536,
};

export function resolveNetworkEvidenceLimits(overrides: Partial<NetworkEvidenceLimits>): NetworkEvidenceLimits {
  const pick = (key: keyof NetworkEvidenceLimits): number => {
    const value = overrides[key];
    return Number.isSafeInteger(value) && Number(value) > 0 ? Math.min(Number(value), HARD_LIMITS[key]) : DEFAULT_LIMITS[key];
  };
  return {
    maxDepth: pick("maxDepth"),
    maxFields: pick("maxFields"),
    maxStringBytes: pick("maxStringBytes"),
    maxBodyBytes: pick("maxBodyBytes"),
    maxEntries: pick("maxEntries"),
    maxUrlBytes: pick("maxUrlBytes"),
  };
}
