// A raw HTTP/1.1 request with a caller-chosen `Host` header. `fetch` (undici) drops a `host` override, so a
// test that plays a browser on a rebound DNS name — loopback socket, foreign `Host` — needs `node:http`.

import { request } from "node:http";

/** What the booted server answered: status, content type and body text. */
export interface HostResponse {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly body: string;
}

/** Send one request to `base` (an `http://127.0.0.1:<port>` origin) with `host` as the `Host` header. */
export function requestWithHost(
  base: string,
  path: string,
  init: { readonly host: string; readonly method?: string; readonly headers?: Record<string, string>; readonly body?: string },
): Promise<HostResponse> {
  const url = new URL(path, base);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? "GET",
        headers: { ...init.headers, host: init.host },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, contentType: res.headers["content-type"], body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) {
      req.write(init.body);
    }
    req.end();
  });
}
