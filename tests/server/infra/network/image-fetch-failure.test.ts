// @subject packages/server/src/infra/network/egress.ts
// A provider-returned image URL that cannot be fetched drops that one image; a closed egress lifetime is a fault and
// rejects instead of passing for a dropped image.

import { createScopedEgress, systemConnector } from "@orb/server/infra/network";
import { createQuietTimers, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";

const IMAGE_URL = "https://images.example/generated.png";

function egressWith(fetch: Parameters<typeof createScopedEgress>[0]["fetch"]): ReturnType<typeof createScopedEgress> {
  return createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(),
    timers: createQuietTimers(),
    buildConnector: systemConnector,
    resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
    fetch,
  });
}

test("a network failure, a refused range and a malformed URL each drop the one image", async () => {
  await using egress = egressWith(() => Promise.reject(new TypeError("fetch failed")));
  await expect(egress.fetchImageBytes(IMAGE_URL)).resolves.toBeNull();
  await expect(egress.fetchImageBytes("https://10.0.0.7/generated.png")).resolves.toBeNull();
  await expect(egress.fetchImageBytes("not a url")).resolves.toBeNull();
});

test("an image fetch after the egress lifetime closed rejects instead of reading as a dropped image", async () => {
  const egress = egressWith(() => Promise.reject(new Error("a closed lifetime reached the raw transport")));
  await egress[Symbol.asyncDispose]();
  await expect(egress.fetchImageBytes(IMAGE_URL)).rejects.toThrow("egress lifetime is closed");
});
