import type { Clock, TimerScheduler } from "@orb/kit/time";
import type { BindPosture } from "#foundation/env/record";
import type { Logger } from "#foundation/observability";
import type { AcmeIssuerDeps } from "#infra/acme";
import type { AllowedHostsReader } from "#infra/auth";
import type { ScopedEgressOptions } from "#infra/network";
import type { CloudflaredPin, RelayAssetFetch, SpawnRelay } from "#infra/relay";
import type { CertificateFacts, OwnedCertificateController, ShareServiceDeps } from "./service.ts";

export interface ShareGraphOptions {
  readonly logger: Logger;
  /** The root's trace ring the share egress's supervised cleanups seal into. */
  readonly traces: ScopedEgressOptions["traces"];
  readonly bind: Pick<BindPosture, "host" | "publicBind">;
  readonly appPort: CertificateFacts["appPort"];
  readonly relayDir: string;
  readonly secretsDir: string;
  readonly now: Clock;
  readonly timers: TimerScheduler;
  readonly buildConnector: ScopedEgressOptions["buildConnector"];
  readonly networkExecution: Pick<ScopedEgressOptions, "fetch" | "resolver">;
  /** The root's env record, for the relay and certificate egress firewall. */
  readonly env: ScopedEgressOptions["env"];
  readonly relay?: { readonly pin?: CloudflaredPin; readonly target?: string } | null;
  readonly acme?: Pick<AcmeIssuerDeps, "directoryUrl" | "polling"> | null;
  /** Compatibility with retained lifecycle callers; the maintained harness scripts raw executable bytes instead. */
  readonly relaySeams?: { readonly pin: CloudflaredPin; readonly fetch: RelayAssetFetch; readonly spawn: SpawnRelay };
}

export interface ShareGraph extends AsyncDisposable {
  readonly settle: OwnedCertificateController["settle"];
  readonly share: Pick<ShareServiceDeps, "relay" | "certificate" | "localSetupUrl" | "appPort" | "publicBind">;
  readonly relayHosts: AllowedHostsReader;
}
