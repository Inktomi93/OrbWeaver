// Native share observations and raw relay/request producers; sharing, session and certificate policy stays in production.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CloudflaredPin } from "@orb/server/infra/relay";
import { CLOUDFLARED_PIN, CLOUDFLARED_TARGETS } from "@orb/server/infra/relay";
import { z } from "zod";
import type { ServerTestHarness } from "./server.ts";

const relayStartSchema = z.strictObject({ pid: z.number(), args: z.array(z.string()) });
export const SHARE_OWNER_PASSWORD = "native-share-root-owner-password";

type ShareCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["share"];

export interface CapturedShareViews {
  readonly status: Awaited<ReturnType<ShareCaller["status"]>>;
  readonly signInMode: Awaited<ReturnType<ShareCaller["signInMode"]>>;
}

/** Capture owner sharing state beside the independently admin-readable guidance; authority stays in the native calls. */
export async function captureShareViews(caller: ShareCaller): Promise<CapturedShareViews> {
  return { status: await caller.status(), signInMode: await caller.signInMode() };
}

/** A harmless native process speaks cloudflared's output protocol and records actual spawn arguments. */
export function relayProgram(url: string, ignoreStop = false): { readonly pin: CloudflaredPin; readonly bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(`#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(__filename + '.starts', JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + '\\n');
console.error('ERR https://api.trycloudflare.com/tunnel');
console.error('Your quick Tunnel has been created!');
console.error(${JSON.stringify(url)});
console.error('https://someone-elses-tunnel.trycloudflare.com');
setInterval(() => {}, 1000);
process.once('SIGINT', () => { ${ignoreStop ? "fs.writeFileSync(__filename + '.stopping', 'SIGINT');" : "process.exit(0);"} });
`);
  const asset = { file: "cloudflared-script", packaging: "binary", bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") } as const;
  const assets = { ...CLOUDFLARED_PIN.assets };
  for (const target of CLOUDFLARED_TARGETS) {
    assets[target] = asset;
  }
  return { bytes, pin: { ...CLOUDFLARED_PIN, assets } };
}

export function relayExecutable(harness: Pick<ServerTestHarness, "relayDir">, pin: CloudflaredPin): string {
  return join(harness.relayDir, `${pin.version}-${pin.assets["linux-x64"].file}`);
}

export async function readRelayStarts(executable: string): Promise<z.infer<typeof relayStartSchema>[]> {
  return (await readFile(`${executable}.starts`, "utf8"))
    .trim()
    .split("\n")
    .map((line) => relayStartSchema.parse(JSON.parse(line)));
}

/** Claim through the real native request, including its actual loopback peer and CSRF admission. */
export async function claimShareOwner(harness: Pick<ServerTestHarness, "listen">): Promise<string> {
  const address = await harness.listen();
  const claimed = await fetch(`http://127.0.0.1:${address.port}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password: SHARE_OWNER_PASSWORD }),
  });
  await claimed.arrayBuffer();
  const cookie = claimed.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  if (claimed.status !== 200 || cookie === "") {
    throw new Error("The native sharing setup did not claim its owner session");
  }
  return cookie;
}
