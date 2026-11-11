// @subject packages/server/src/infra/network/egress.ts
// A provider-returned image URL that cannot be fetched drops that one image; a closed egress lifetime is a fault and
// rejects instead of passing for a dropped image. A name that does not resolve is the egress module's own typed
// refusal for every safeFetch caller, and any other resolver fault still rejects.

import { createScopedEgress, EgressBlockedError, systemConnector } from "@orb/server/infra/network";
import { createQuietTimers, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";

type EgressResolver = Parameters<typeof createScopedEgress>[0]["resolver"];

const IMAGE_URL = "https://images.example/generated.png";
const DOCUMENT_URL = "https://pages.example/article.html";
const PRIVATE_ADDRESS = "10.0.0.7";

const publicResolver: EgressResolver = () => Promise.resolve([PUBLIC_PEER_ADDRESS]);

/** The error `dns.lookup` rejects with for a name it cannot resolve: an Error carrying the errno `code`. */
function lookupFailure(code: string): Error {
  return Object.assign(new Error(`getaddrinfo ${code} images.example`), { code, syscall: "getaddrinfo", hostname: "images.example" });
}

function egressWith(
  fetch: Parameters<typeof createScopedEgress>[0]["fetch"],
  resolver: EgressResolver = publicResolver,
): ReturnType<typeof createScopedEgress> {
  return createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(),
    timers: createQuietTimers(),
    buildConnector: systemConnector,
    resolver,
    fetch,
  });
}

const unreachableFetch = (): Promise<Response> => Promise.reject(new Error("a refused request reached the raw transport"));

test("a network failure, an IP-literal host and a malformed URL each drop the one image", async () => {
  await using egress = egressWith(() => Promise.reject(new TypeError("fetch failed")));
  await expect(egress.fetchImageBytes(IMAGE_URL)).resolves.toBeNull();
  await expect(egress.fetchImageBytes(`https://${PRIVATE_ADDRESS}/generated.png`)).resolves.toBeNull();
  await expect(egress.fetchImageBytes("not a url")).resolves.toBeNull();
});

test("a host that resolves into a private range drops the one image", async () => {
  await using egress = egressWith(unreachableFetch, () => Promise.resolve([PRIVATE_ADDRESS]));
  await expect(egress.fetchImageBytes(IMAGE_URL)).resolves.toBeNull();
});

test.for(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"])("an image host whose name does not resolve (%s) drops the one image", async (code) => {
  await using egress = egressWith(unreachableFetch, () => Promise.reject(lookupFailure(code)));
  await expect(egress.fetchImageBytes(IMAGE_URL)).resolves.toBeNull();
});

test("a web document whose host does not resolve is the typed unresolvable refusal", async () => {
  await using egress = egressWith(unreachableFetch, () => Promise.reject(lookupFailure("ENOTFOUND")));
  const refused = egress.fetchWebDocument(DOCUMENT_URL);
  await expect(refused).rejects.toBeInstanceOf(EgressBlockedError);
  await expect(refused).rejects.toMatchObject({ reason: "unresolvable" });
});

test("a resolver fault that is not a missing name still rejects the image fetch", async () => {
  const broken = Object.assign(new Error("resolver socket refused"), { code: "ECONNREFUSED" });
  await using egress = egressWith(unreachableFetch, () => Promise.reject(broken));
  await expect(egress.fetchImageBytes(IMAGE_URL)).rejects.toBe(broken);
});

test("an image fetch after the egress lifetime closed rejects instead of reading as a dropped image", async () => {
  const egress = egressWith(unreachableFetch);
  await egress[Symbol.asyncDispose]();
  await expect(egress.fetchImageBytes(IMAGE_URL)).rejects.toThrow("egress lifetime is closed");
});
