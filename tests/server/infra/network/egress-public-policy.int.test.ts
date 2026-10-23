// Public URL execution cannot acquire configured-endpoint authority from extra JavaScript options.
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const PRIVATE_HOST = "private-egress.test";
const PRIVATE_ADDRESS = "192.168.1.50";
const PRIVATE_PORT = 8000;
const PUBLIC_ADDRESS = "93.184.215.14";
const PUBLIC_HOST = "public-egress.test";
const PUBLIC_URL = `https://${PUBLIC_HOST}/start`;

const forgedCases = [
  { name: "HTTP scheme", url: `http://${PRIVATE_ADDRESS}:${PRIVATE_PORT}/models`, host: PRIVATE_ADDRESS, reason: "scheme" },
  { name: "IP literal", url: `https://${PRIVATE_ADDRESS}:${PRIVATE_PORT}/image`, host: PRIVATE_ADDRESS, reason: "ip-literal" },
  { name: "private DNS answer", url: `https://${PRIVATE_HOST}/image`, host: PRIVATE_HOST, reason: "private-address" },
] as const;

test.for(forgedCases)("public execution refuses an extra configured option for $name", async (row) => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: (hostname) => Promise.resolve([hostname === PRIVATE_HOST ? PRIVATE_ADDRESS : PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(new Response("owned physical bytes"));
      },
    },
  });
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_HOST}:443`, `${PRIVATE_ADDRESS}:${PRIVATE_PORT}`] },
  });
  const widerOptions = { allowedHosts: [row.host], ownerConfiguredEndpoint: true };
  await expect.soft(root.app.egress.safeFetch(row.url, widerOptions)).rejects.toMatchObject({ name: "EgressBlockedError", reason: row.reason });
  expect.soft(calls).toEqual([]);
});

test.for([
  { name: "private DNS redirect", next: `https://${PRIVATE_HOST}/redirected`, reason: "private-address" },
  { name: "HTTP redirect downgrade", next: `http://${PUBLIC_HOST}/redirected`, reason: "scheme" },
] as const)("public execution refuses an extra configured option for $name", async (row) => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: (hostname) => Promise.resolve([hostname === PRIVATE_HOST ? PRIVATE_ADDRESS : PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        const url = new Request(input, init).url;
        calls.push(url);
        return Promise.resolve(url === PUBLIC_URL ? Response.redirect(row.next, 302) : new Response("forbidden second hop"));
      },
    },
  });
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_HOST}:443`] },
  });
  const widerOptions = { allowedHosts: [PUBLIC_HOST, PRIVATE_HOST], ownerConfiguredEndpoint: true };
  await expect.soft(root.app.egress.safeFetch(PUBLIC_URL, widerOptions)).rejects.toMatchObject({ name: "EgressBlockedError", reason: row.reason });
  expect.soft(calls).toEqual([PUBLIC_URL]);
});

test("public execution still reads an allowed public response through its owned byte reader", async () => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(new Response("public bytes", { headers: { "content-type": "text/plain" } }));
      },
    },
  });
  const response = await root.app.egress.safeFetch(PUBLIC_URL, { allowedHosts: [PUBLIC_HOST], maxBytes: 1024 });
  expect(response.status).toBe(200);
  expect(response.contentType).toBe("text/plain");
  expect(new TextDecoder().decode(await response.bytes())).toBe("public bytes");
  expect(calls).toEqual([PUBLIC_URL]);
  await expect(response.bytes()).rejects.toMatchObject({ reason: "consumed" });
});

test("the public required-host boundary refuses an off-host redirect before its physical hop", async () => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(Response.redirect("https://other-egress.test/image", 302));
      },
    },
  });
  await expect(root.app.egress.safeFetch(PUBLIC_URL, { allowedHosts: [PUBLIC_HOST] })).rejects.toMatchObject({ reason: "host-not-allowed" });
  expect(calls).toEqual([PUBLIC_URL]);
});

test("configured execution retains HTTP LAN admission while refusing an unadmitted port", async () => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PRIVATE_ADDRESS]),
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(new Response("configured bytes"));
      },
    },
  });
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_ADDRESS}:${PRIVATE_PORT}`] },
  });
  const admitted = `http://${PRIVATE_ADDRESS}:${PRIVATE_PORT}/models`;
  expect(await (await root.app.egress.configuredEndpointFetch(admitted)).text()).toBe("configured bytes");
  await expect(root.app.egress.configuredEndpointFetch(`http://${PRIVATE_ADDRESS}:${PRIVATE_PORT + 1}/models`)).rejects.toMatchObject({
    reason: "private-address",
  });
  expect(calls).toEqual([admitted]);
});

test("configured execution preserves the caller's native manual-redirect request policy", async () => {
  const requests: Request[] = [];
  const next = "https://other-egress.test/configured";
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.redirect(next, 302));
      },
    },
  });
  const response = await root.app.egress.configuredEndpointFetch(PUBLIC_URL, { redirect: "manual" });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(next);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toBe(PUBLIC_URL);
  expect(requests[0]?.redirect).toBe("manual");
  await response.body?.cancel();
});

test("disposing the actual root revokes a held public response and its execution capability", async () => {
  const calls: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(new Response("held public bytes"));
      },
    },
  });
  const held = await root.app.egress.safeFetch(PUBLIC_URL, { allowedHosts: [PUBLIC_HOST] });
  await root[Symbol.asyncDispose]();
  await expect(held.bytes()).rejects.toMatchObject({ name: "AbortError" });
  await expect(root.app.egress.safeFetch(PUBLIC_URL, { allowedHosts: [PUBLIC_HOST] })).rejects.toThrow("egress lifetime is closed");
  expect(calls).toEqual([PUBLIC_URL]);
  expect(root.timers.pending()).toBe(0);
});
