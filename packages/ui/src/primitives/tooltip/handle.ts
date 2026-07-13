import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

// A detached tooltip handle. Unlike Dialog, it has NO openWithPayload — attach `payload`+`id` to a
// (possibly detached) trigger and call handle.open(triggerId) instead.
export const createTooltipHandle = BaseTooltip.createHandle;

export type TooltipHandle<Payload = unknown> = BaseTooltip.Handle<Payload>;
