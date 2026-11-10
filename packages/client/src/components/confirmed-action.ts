// The opener of a confirm another surface renders, branded so `orb/destructive-needs-confirm` can prove the confirm
// from the press handler's type alone (docs/law/client-architecture-state-and-gates.md §14).

const CONFIRMED: unique symbol = Symbol("ConfirmedAction");

/**
 * A press handler that only opens a confirm its owner renders: a controlled `ConfirmDialog` or a Cancel-able editing
 * dialog. A child row takes it as a prop, so the confirm stays with the surface that outlives the row.
 */
export type ConfirmedAction = (() => void) & { readonly [CONFIRMED]: true };

/** Brands the opener of a confirm. `orb/confirmed-action-mint` allows the call only in `CONFIRMED_ACTION_MINT_HOMES`, each of which renders the confirm `open` reveals. */
export function confirmedAction(open: () => void): ConfirmedAction {
  return Object.assign(open, { [CONFIRMED]: true as const });
}
