// One owned native sharing graph supplies lifecycle and testkit; domain controllers retain every live policy.
import process from "node:process";
import type { ShareGraph, ShareGraphOptions } from "#domain/share";
import { createCertificateController, createRelayController } from "#domain/share";
import { loopbackOrigin } from "#foundation/env";
import { ACME_POLLING, createCertificateStore, createOwnedAcmeIssuer, LETS_ENCRYPT_DIRECTORY } from "#infra/acme";
import { createRelayHostRegistry } from "#infra/auth";
import { createScopedEgress, startTlsTerminator } from "#infra/network";
import { CLOUDFLARED_PIN, createOwnedRelayLauncher } from "#infra/relay";

/** Assemble native sharing over raw execution inputs, with physical joins before the caller releases storage. */
export async function createShareGraph(options: ShareGraphOptions): Promise<ShareGraph> {
  await using owners = new AsyncDisposableStack();
  const network = owners.use(createScopedEgress({ ...options.networkExecution, timers: options.timers, buildConnector: options.buildConnector }));
  const hosts = createRelayHostRegistry();
  const pin = options.relaySeams?.pin ?? options.relay?.pin ?? CLOUDFLARED_PIN;
  // biome-ignore lint/nursery/useDisposables: the moved graph stack owns this exact launcher until native child and download completion.
  const launcher = owners.use(
    createOwnedRelayLauncher({
      pin: options.relay === null ? null : pin,
      target: options.relay?.target ?? `${process.platform}-${process.arch}`,
      dir: options.relayDir,
      schedule: options.timers.timeoutUnref,
      fetch: options.relaySeams?.fetch ?? ((url, limits) => network.fetchPinnedDownload(url, { ...limits, allowedHosts: pin.downloadHosts })),
      ...(options.relaySeams === undefined ? {} : { spawn: options.relaySeams.spawn }),
    }),
  );
  const issuer = owners.use(
    createOwnedAcmeIssuer(options.acme === null ? undefined : (options.acme ?? { directoryUrl: LETS_ENCRYPT_DIRECTORY, polling: ACME_POLLING })),
  );
  const origin = (): string => loopbackOrigin(options.bind.host, options.appPort());
  const certificate = owners.use(
    createCertificateController({
      issuer,
      store: createCertificateStore(options.secretsDir),
      startHttps: (https) => startTlsTerminator({ ...https, host: options.bind.host, upstream: origin }),
      bindHost: options.bind.host,
      now: options.now,
      schedule: options.timers.timeoutUnref,
    }),
  );
  const relay = createRelayController({ relay: "quick", launcher, hosts: hosts.writer, origin, now: options.now, schedule: options.timers.timeoutUnref });
  owners.defer(() => {
    using cancellation = new DisposableStack();
    cancellation.defer(network.cancel);
    cancellation.defer(launcher.cancel);
    cancellation.defer(issuer.cancel);
    cancellation.defer(relay.stop);
  });
  const lifetime = owners.move();
  return {
    settle: certificate.settle,
    share: { relay, certificate, localSetupUrl: () => `http://localhost:${options.appPort()}`, appPort: options.appPort, publicBind: options.bind.publicBind },
    relayHosts: hosts.hosts,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
