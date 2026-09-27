// The IP certificate's renewal schedule (D269): the first attempt at half the certificate's life, each failure waiting
// twice as long as the last, and no attempt at all in the final guard window, so nothing is ever tried after expiry.

/** The share of a certificate's life that passes before its first renewal attempt. */
export const RENEW_AT_LIFETIME_FRACTION = 0.5;
/** The wait after the first failed renewal; each further failure doubles it up to {@link RENEWAL_RETRY_MAX_MS}. */
export const RENEWAL_RETRY_FIRST_MS = 900_000;
export const RENEWAL_RETRY_MAX_MS = 21_600_000;
/** No renewal starts later than this long before the certificate expires. */
export const EXPIRY_GUARD_MS = 3_600_000;

const BACKOFF_FACTOR = 2;

/** When to try the next renewal (epoch ms), or null when no attempt fits before the guard window. `failures` counts
 *  the failed renewals of this certificate since it was issued. */
export function nextRenewalAt(validity: { readonly notBefore: number; readonly notAfter: number }, failures: number, now: number): number | null {
  const latest = validity.notAfter - EXPIRY_GUARD_MS;
  if (now >= latest) {
    return null;
  }
  if (failures === 0) {
    const windowOpens = validity.notBefore + (validity.notAfter - validity.notBefore) * RENEW_AT_LIFETIME_FRACTION;
    return Math.min(Math.max(now, windowOpens), latest);
  }
  const backoff = Math.min(RENEWAL_RETRY_FIRST_MS * BACKOFF_FACTOR ** (failures - 1), RENEWAL_RETRY_MAX_MS);
  return Math.min(now + backoff, latest);
}
