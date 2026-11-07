// What one wire-capture read may mean. Disabled capture is an absent instrument; an enabled read with no capture means
// the turn never reached the provider seam, so it fails here instead of reaching a caller as an empty list.
import type { WireCapture, WireCapturesResponse } from "@orb/contracts/debug";
import type { ChatId } from "@orb/kit/ids";

export type WireCaptureRead =
  | { readonly enabled: false; readonly skipReason: string }
  | { readonly enabled: true; readonly captures: readonly [WireCapture, ...WireCapture[]] };

export function wireCaptureRead(response: WireCapturesResponse, chatId: ChatId, backend?: string): WireCaptureRead {
  if (!response.enabled) {
    return { enabled: false, skipReason: "WIRE_CAPTURE is off on this stack, so no provider request was recorded" };
  }
  const [newest, ...older] = response.captures;
  if (newest === undefined) {
    throw new Error(`WIRE_CAPTURE is on but chat ${chatId} has no capture for ${backend ?? "any provider"}: the turn never reached that provider`);
  }
  return { enabled: true, captures: [newest, ...older] };
}
