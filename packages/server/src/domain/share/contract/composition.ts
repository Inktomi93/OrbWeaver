import type { TimerScheduler } from "@orb/kit/time";
import type { BindPosture } from "#foundation/env";
import type { AcmeIssuerDeps } from "#infra/acme";
import type { AllowedHostsReader } from "#infra/auth";
import type { ScopedEgressOptions } from "#infra/network";
import type { CloudflaredPin, RelayAssetFetch, SpawnRelay } from "#infra/relay";
import type { ShareServiceDeps } from "./service.ts";

export interface ShareGraphOptions {
  readonly bind: Pick<BindPosture, "host" | "publicBind">;
  readonly appPort: () => number;
  readonly relayDir: string;
  readonly secretsDir: string;
  readonly now: () => number;
  readonly timers: TimerScheduler;
  readonly buildConnector: ScopedEgressOptions["buildConnector"];
  readonly networkExecution: Pick<ScopedEgressOptions, "fetch" | "resolver">;
  readonly relay?: { readonly pin?: CloudflaredPin; readonly target?: string } | null;
  readonly acme?: Pick<AcmeIssuerDeps, "directoryUrl" | "polling"> | null;
  /** Compatibility with retained lifecycle callers; the maintained harness scripts raw executable bytes instead. */
  readonly relaySeams?: { readonly pin: CloudflaredPin; readonly fetch: RelayAssetFetch; readonly spawn: SpawnRelay };
}

export interface ShareGraph extends AsyncDisposable {
  readonly settle: () => Promise<void>;
  readonly share: Pick<ShareServiceDeps, "relay" | "certificate" | "localSetupUrl" | "appPort" | "publicBind">;
  readonly relayHosts: AllowedHostsReader;
}
