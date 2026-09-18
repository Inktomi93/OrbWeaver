// The loopback-only DevTools frontend static server, extracted from devtools-assets.ts.
// Serves verified-and-hashed resources over HTTP on 127.0.0.1 with immutable caching.
//
// Both `VerifiedDevToolsAssets` and `DevToolsAssetServer` live in the shared leaf
// devtools-assets-types.ts, not in devtools-assets.ts — the front door and this server both
// import FROM that leaf so the edge between the front door and this file stays one-directional
// (dependency-cruiser `no-circular` has no type-only exemption).
import type { Server } from "node:http";
import { createServer } from "node:http";
import { normalize } from "node:path";
import type { DevToolsAssetServer, VerifiedDevToolsAssets } from "./devtools-assets-types.ts";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

function requestPath(rawUrl: string | undefined): string | null {
  if (rawUrl === undefined || rawUrl.includes("%") || rawUrl.includes("\\")) {
    return null;
  }
  const path = rawUrl.split("?", 1)[0] as string;
  return path.startsWith("/") && normalize(path) === path && !path.includes("//") && !path.split("/").includes("..") ? path : null;
}

export async function startDevToolsAssetServer(assets: VerifiedDevToolsAssets): Promise<DevToolsAssetServer> {
  const unexpectedRequests: string[] = [];
  const server: Server = createServer((request, response) => {
    const remote = request.socket.remoteAddress;
    const path = requestPath(request.url);
    if (remote !== "127.0.0.1" || (request.method !== "GET" && request.method !== "HEAD") || path === null) {
      unexpectedRequests.push(`${request.method ?? "(method)"} ${request.url ?? "(url)"} from ${remote ?? "(address)"}`);
      response.writeHead(HTTP_FORBIDDEN).end();
      return;
    }
    const verified = assets.filesByUrl.get(path);
    if (verified === undefined) {
      unexpectedRequests.push(`${request.method} ${path}`);
      response.writeHead(HTTP_NOT_FOUND).end();
      return;
    }
    response.writeHead(HTTP_OK, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": verified.entry.bytes,
      "content-type": verified.entry.mimeType,
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(verified.body);
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
    throw new Error("DevTools asset server did not bind IPv4 loopback");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    unexpectedRequests,
    close: async (): Promise<void> => new Promise<void>((done, reject) => server.close((error) => (error === undefined ? done() : reject(error)))),
  };
}
