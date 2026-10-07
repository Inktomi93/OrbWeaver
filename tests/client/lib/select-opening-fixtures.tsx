import type { SelectOpeningObservation } from "@orb/ui/select";

export interface SelectOpeningProbe {
  readonly transitions: readonly { readonly type: string; readonly property: string; readonly trusted: boolean }[];
  readonly callbacks: readonly { readonly open: boolean; readonly eventType: string; readonly trusted: boolean; readonly canceled: boolean }[];
  readonly observations: readonly {
    readonly requestId: number;
    readonly phase: SelectOpeningObservation["phase"];
    readonly triggerName: string | null;
    readonly originType: string;
    readonly originTrusted: boolean;
    readonly originTime: number;
    readonly callbackType: string;
    readonly callbackTrusted: boolean;
    readonly sameCallerEvent: boolean;
  }[];
}
