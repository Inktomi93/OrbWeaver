// Shared helpers for the local-server probes: plain HTTP against a rig arm, a JSONL evidence writer, and the
// one image the vision probes send.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = path.join(DIR, "results");

/** A CPU-only rig answers a long prompt slowly; the budget is generous on purpose. */
const REQUEST_TIMEOUT_MS = 600_000;
const HEALTH_TIMEOUT_MS = 5000;
const HEALTH_INTERVAL_MS = 2000;
const DEFAULT_HEALTH_TRIES = 150;

export interface HttpResult {
  readonly status: number;
  readonly json: unknown;
  readonly text: string;
  readonly ms: number;
}

export async function http(
  url: string,
  init?: { readonly method?: "GET" | "POST" | "DELETE"; readonly body?: unknown; readonly timeoutMs?: number },
): Promise<HttpResult> {
  const started = Date.now();
  const res = await fetch(url, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? {} : { "content-type": "application/json" },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(init?.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, ms: Date.now() - started };
}

export async function waitFor(url: string, tries = DEFAULT_HEALTH_TRIES): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
  }
  throw new Error(`timed out waiting for ${url}`);
}

export function jsonl(arm: string): { readonly row: (row: Record<string, unknown>) => void; readonly path: string } {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${arm}.jsonl`);
  return {
    path: file,
    row: (row): void => {
      appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);
    },
  };
}

export function writeRaw(arm: string, name: string, body: unknown): void {
  const dir = path.join(RESULTS_DIR, "raw", arm);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
}

/** A solid red 64 by 64 PNG: enough to prove an image part reaches the model, small enough to inline. */
export const RED_SQUARE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtx/ZMZxgi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywKqxUDxqh7TUQAAAABJRU5ErkJggg==";
