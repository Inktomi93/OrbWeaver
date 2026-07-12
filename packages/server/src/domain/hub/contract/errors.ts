// domain/hub/contract/errors — the hub op-code namespace for `DomainOperationError` (the codes the client
// branches on, never message text). A missing gif-search key reuses `DomainNoCredentialError("gif-search")`
// (the same "surface a banner pointing at setup" floor the LLM resolver uses) — not an op code here.

/** Stable op codes for the hub's `DomainOperationError`s. `unavailable` = the upstream provider (Tenor)
 *  failed/non-2xx (never the upstream body — remote HTML never reaches the client). `rejectedContent` =
 *  the imported bytes failed the SSRF host gate or the image guard (bad host / not-an-image / over-cap /
 *  dimension bomb) — a single leak-free code, the specific reason stays server-side. */
export const HUB_OP_CODES = {
  unavailable: "hub_unavailable",
  rejectedContent: "hub_rejected_content",
} as const;
