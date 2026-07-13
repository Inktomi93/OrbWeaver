// domain/hub/contract/errors — the hub op-code namespace for DomainOperationError. A missing gif-search
// key reuses DomainNoCredentialError("gif-search") instead of an op code here.

/** unavailable = upstream provider failed/non-2xx. rejectedContent = imported bytes failed the SSRF host
 *  gate or the image guard — a single leak-free code, the specific reason stays server-side. */
export const HUB_OP_CODES = {
  unavailable: "hub_unavailable",
  rejectedContent: "hub_rejected_content",
} as const;
