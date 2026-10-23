/** Where a prompt slice is delivered. */
export type SliceDelivery = "system-half" | "in-chat";

export function deliver(where: SliceDelivery): string {
  return where;
}
