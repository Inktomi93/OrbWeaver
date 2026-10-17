// Native external request bytes; a missing limit hits the tripwire before a body consumer can finish buffering.
import { CARD_FRAME_MINT_BODY_MAX_BYTES, CARD_FRAME_ROUTE } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { PLUGIN_FRAME_MINT_BODY_MAX_BYTES, PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import { ASSET_UPLOAD_MAX_BYTES, DATABANK_UPLOAD_MAX_BYTES, IMPORT_MAX_TOTAL_BYTES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";

export const REQUEST_CHUNK_BYTES = 64 * 1024;
// This hostile form is larger than every small auth envelope, not a copy of their private budgets.
const AUTH_ATTACK_BYTES = PLUGIN_FRAME_MINT_BODY_MAX_BYTES * 4;
export const INTAKE_ROUTES = [
  { path: "/api/assets/upload", bytes: ASSET_UPLOAD_MAX_BYTES + 1 },
  { path: "/api/databank/upload", bytes: DATABANK_UPLOAD_MAX_BYTES + 1 },
  { path: "/api/import", bytes: IMPORT_MAX_TOTAL_BYTES + 1 },
  { path: "/api/import/restore-card-lorebook", bytes: IMPORT_MAX_TOTAL_BYTES + 1 },
  { path: "/api/import/chat", bytes: IMPORT_MAX_TOTAL_BYTES + 1 },
  { path: "/api/import/tree", bytes: IMPORT_TREE_MAX_TOTAL_BYTES + 1 },
  { path: "/api/import/tree/review", bytes: IMPORT_TREE_MAX_TOTAL_BYTES + 1 },
] as const;
export const FRAME_ROUTES = [
  { path: CARD_FRAME_ROUTE, bytes: CARD_FRAME_MINT_BODY_MAX_BYTES + 1 },
  { path: PLUGIN_FRAME_ROUTE, bytes: PLUGIN_FRAME_MINT_BODY_MAX_BYTES + 1 },
] as const;
export const LOCAL_AUTH_ROUTES = ["/api/auth/login", "/api/auth/first-run", "/api/auth/signup", "/api/auth/signup/preview"].map((path) => ({
  path,
  bytes: AUTH_ATTACK_BYTES,
}));
export const PENDING_ROUTES = ["/api/auth/oidc/pending/preview", "/api/auth/oidc/pending/confirm"].map((path) => ({ path, bytes: AUTH_ATTACK_BYTES }));
export const BACKCHANNEL_ROUTE = { path: "/api/auth/oidc/backchannel-logout", bytes: AUTH_ATTACK_BYTES };
// The native root also mounts this separately owned, capped diagnostic mutation outside entry/http.
export const DEBUG_ROUTE = { path: "/api/_debug/bug-report", bytes: DATABANK_UPLOAD_MAX_BYTES + 1 };
export const BUNDLE_ROUTE = "/api/import/bundle";
export const LOGOUT_ROUTE = "/api/auth/logout";
export const PLUGIN_DELETE_ROUTE = `${PLUGIN_FRAME_ROUTE}/:id`;
export const CSRF_HEADERS = { [CSRF_HEADER]: "1" };

/** Produce real byte chunks with no prefetch; reaching the tail is evidence that the boundary failed. */
export function observedBody(bytes: number): {
  readonly body: ReadableStream<Uint8Array>;
  readonly snapshot: () => { readonly pulls: number; readonly bytes: number; readonly cancelled: boolean; readonly tripwire: boolean };
  readonly [Symbol.dispose]: () => void;
} {
  const chunk = new Uint8Array(Math.min(bytes, REQUEST_CHUNK_BYTES)).fill(65);
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let produced = 0;
  let pulls = 0;
  let cancelled = false;
  let tripwire = false;
  let ended = false;
  const body = new ReadableStream<Uint8Array>(
    {
      start: (value): void => {
        controller = value;
      },
      pull: (target): void => {
        pulls += 1;
        if (produced === bytes) {
          ended = true;
          tripwire = true;
          target.error(new Error("body-limit input consumed its forbidden tail"));
          return;
        }
        const value = chunk.subarray(0, Math.min(chunk.byteLength, bytes - produced));
        produced += value.byteLength;
        target.enqueue(value);
      },
      cancel: (): void => {
        ended = true;
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    body,
    snapshot: () => ({ pulls, bytes: produced, cancelled, tripwire }),
    [Symbol.dispose]: (): void => {
      if (!ended) {
        ended = true;
        controller?.close();
      }
    },
  };
}

/** Let the real root construct the Request once; cloning a prebuilt Request introduces native body prefetch. */
export function bodyRequest(
  root: Pick<ServerTestHarness, "http">,
  path: string,
  body: ReadableStream<Uint8Array>,
  headers: ConstructorParameters<typeof Headers>[0] = CSRF_HEADERS,
): Promise<Response> {
  return Promise.resolve(root.http.request(path, { method: "POST", headers, body, duplex: "half" }));
}
