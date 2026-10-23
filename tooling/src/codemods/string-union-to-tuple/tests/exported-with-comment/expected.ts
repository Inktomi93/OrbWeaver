export const SLICE_DELIVERIES = ["system-half", "in-chat"] as const;
/** Where a prompt slice is delivered. */
export type SliceDelivery = (typeof SLICE_DELIVERIES)[number];

export function deliver(where: SliceDelivery): string {
  return where;
}
