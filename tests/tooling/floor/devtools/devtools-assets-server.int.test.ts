import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:http";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { verifyDevToolsAssets } from "@orb/tooling/floor/devtools/devtools-assets";
import { startDevToolsAssetServer } from "@orb/tooling/floor/devtools/devtools-assets-server";

// A raw request target keeps dot segments and backslashes intact until the production boundary sees them.
async function rawRequest(
  origin: string,
  path: string,
  method = "GET",
): Promise<{
  readonly status: number | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}> {
  const url = new URL(origin);
  return await new Promise((resolve, reject) => {
    const outgoing = request({ hostname: url.hostname, port: url.port, method, path }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.once("error", reject);
      incoming.once("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

test("the asset HTTP boundary serves exact canonical URLs and refuses raw alternate spellings", async ({ repoRoot }) => {
  const assets = verifyDevToolsAssets(join(repoRoot, "tooling/src/snap/lib/devtools-frontend"));
  const member = assets.manifest.resources.find(({ url }) => url.endsWith("/inspector.html"));
  if (member === undefined) {
    throw new Error("the verified DevTools closure has no inspector entry");
  }
  const path = member.url;
  const server = await startDevToolsAssetServer(assets);
  try {
    expect(new URL(server.origin).hostname).toBe("127.0.0.1");
    const get = await rawRequest(server.origin, path);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(assets.filesByUrl.get(path)?.body);
    expect(get.headers["x-content-type-options"]).toBe("nosniff");
    expect(get.headers["content-length"]).toBe(String(member.bytes));
    const head = await rawRequest(server.origin, path, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body.byteLength).toBe(0);
    const query = await rawRequest(server.origin, `${path}?version=1`);
    expect(query.status).toBe(200);
    expect(query.body).toEqual(get.body);

    const rejected = [
      `/${path}`,
      `/./${path.slice(1)}`,
      `/other/../${path.slice(1)}`,
      `${path}/..`,
      path.replace("/serve_rev/", "/serve_rev\\/"),
      path.replace("/serve_rev/", "/%73erve_rev/"),
      path.replace("/serve_rev/", "/serve_rev%2f/"),
      path.replace("/serve_rev/", "/serve_rev%252f/"),
      `${path}?encoded=%2f`,
    ];
    for (const target of rejected) {
      expect((await rawRequest(server.origin, target)).status, target).toBe(403);
    }
    const methods = ["POST", "PUT", "OPTIONS"];
    for (const method of methods) {
      expect((await rawRequest(server.origin, path, method)).status, method).toBe(403);
    }
    expect((await rawRequest(server.origin, "/absent-resource")).status).toBe(404);
    expect(server.unexpectedRequests).toHaveLength(rejected.length + methods.length + 1);
  } finally {
    await server.close();
  }
});
