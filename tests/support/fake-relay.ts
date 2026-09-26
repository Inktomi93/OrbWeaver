// A share relay with no network and no tunnel: a pin whose every asset is a few known bytes, a fetch that serves them
// and counts each request, and a spawn that records each relay the controller starts. The lifecycle's own checksum
// verifier still runs over them, in the data layout's relay directory.

import { createHash } from "node:crypto";
import type { CloudflaredAsset, CloudflaredPin, CloudflaredTarget, RelayAssetFetch, RelayEvents, RelayProcess, SpawnRelay } from "@orb/server/infra/relay";
import { CLOUDFLARED_PIN, CLOUDFLARED_TARGETS } from "@orb/server/infra/relay";

export interface FakeRelay {
  readonly executable: string;
  readonly origin: string;
  readonly events: RelayEvents;
  stopped: boolean;
}

export interface FakeRelaySeams {
  readonly pin: CloudflaredPin;
  readonly fetch: RelayAssetFetch;
  readonly spawn: SpawnRelay;
  /** The file name and bytes every pinned asset carries, whichever target this process runs on. */
  readonly file: string;
  readonly bytes: Uint8Array;
  /** Every URL the verifier asked the fetch for, in order. */
  readonly fetched: string[];
  readonly relays: FakeRelay[];
  readonly latest: () => FakeRelay;
}

export function fakeRelaySeams(): FakeRelaySeams {
  const file = "cloudflared-fake";
  const bytes = new TextEncoder().encode("#!/bin/sh\n# stands in for cloudflared\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const assets: Record<CloudflaredTarget, CloudflaredAsset> = { ...CLOUDFLARED_PIN.assets };
  for (const target of CLOUDFLARED_TARGETS) {
    assets[target] = { file, packaging: "binary", bytes: bytes.byteLength, sha256 };
  }
  const fetched: string[] = [];
  const relays: FakeRelay[] = [];
  return {
    pin: { ...CLOUDFLARED_PIN, assets },
    file,
    bytes,
    fetched,
    relays,
    fetch: (url): Promise<Response> => {
      fetched.push(url);
      return Promise.resolve(new Response(bytes));
    },
    spawn: (executable, origin, events): RelayProcess => {
      const relay: FakeRelay = { executable, origin, events, stopped: false };
      relays.push(relay);
      return {
        stop: (): void => {
          relay.stopped = true;
        },
      };
    },
    latest: (): FakeRelay => {
      const relay = relays.at(-1);
      if (relay === undefined) {
        throw new Error("no relay was launched");
      }
      return relay;
    },
  };
}
