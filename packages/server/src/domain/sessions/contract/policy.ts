// Sessions-owned OIDC timing rules. The route tier sets each cookie's Max-Age from the same window.

/** How long a minted OIDC transaction stays consumable. The binding cookie's Max-Age is this same window. */
export const OIDC_TRANSACTION_TTL_MS = 600_000;

/** How long a pending join stays confirmable. The cookie's Max-Age is this same window. */
export const OIDC_PENDING_JOIN_TTL_MS = 600_000;
