// `TRUSTED_PRIVATE_RANGES`: extra ranges the egress guard treats as private. One parse for the boot refusal and for
// the guard (`infra/network/egress.ts`), so the entries boot checks are the entries the guard matches.

import { parseCidr } from "@orb/kit/ip";

const TRUSTED_PRIVATE_RANGES_KEY = "TRUSTED_PRIVATE_RANGES";
const LIST_SEPARATOR = ",";

/** The entries, trimmed, with empty list items dropped. */
export function parseTrustedPrivateRanges(raw: string | undefined): readonly string[] {
  return (raw ?? "")
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** The entries the range match cannot read. Each would fence nothing, so boot refuses it. */
export function unreadableTrustedPrivateRanges(raw: string | undefined): readonly string[] {
  return parseTrustedPrivateRanges(raw).filter((entry) => parseCidr(entry) === null);
}

/** The parse refusal for one unreadable entry, naming it and the grammar. */
export function trustedPrivateRangeRefusal(entry: string): { readonly key: string; readonly message: string } {
  return {
    key: TRUSTED_PRIVATE_RANGES_KEY,
    message: `${TRUSTED_PRIVATE_RANGES_KEY} entry "${entry}" is not an IP address or a CIDR range, so the egress guard would fence nothing with it. Write an address and a prefix length, such as 10.0.0.0/8 or fd00::/8, or a single address.`,
  };
}
