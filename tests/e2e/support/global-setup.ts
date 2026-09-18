// E2E globalSetup — establishes KNOWN DB state over each mode-project's tRPC API BEFORE any spec runs, so the
// suite stops depending on ambient DB drift (the reason a wiped/latched library silently reddened the whole
// suite — see reports/tooling/PLAYWRIGHT-E2E-SPEEDUP.md, Finding 2). Runs ONCE (Playwright globalSetup),
// AFTER every project's webServer is up; it iterates the mode projects (support/modes.ts) and seeds EACH
// stack by its own origin. Per mode:
//   1. ≥1 CHARACTER exists — the library→chat flow needs a card. The boot seeder is a one-shot per-user latch;
//      a wiped library won't re-seed, so if the API reports zero we author a deterministic anchor.
//   2. ≥1 committed CHAT with ≥1 durable message — the persistence/sequence/injection/multi-tab specs reuse
//      an existing chat; seeding one model-free (chat.startChat) keeps the non-live suite MODEL-FREE.
//   3. The routing roleDefaults pinned to the local vLLM engine (the @live specs' coherent chat wire).
//   4. LOCAL mode ONLY: the multi-user seed (localMultiUser AppSetting on + a member account) by shelling the
//      dev `seed multi-user` (@orb/tooling) — the ONE source of truth for that sequence, not a reimplementation.
//   5. The CLIENT IS WARMED in a real browser (#571) — each mode's vite dev server transforms its route graph
//      HERE, so no spec pays the cold compile inside its own 60s test timeout. Depth per mode is
//      `clientWarmup` (modes.ts, which carries the measurement and the WHY).
//
// Seed via API, not UI — faster + more reliable, and it runs against the SAME running stack the specs hit.
// The un-credentialed 127.0.0.1 owner-fallback seam resolves the owner in every mode (single-user always;
// local/forward-header on a local origin), so these seed calls need no login.
//
// THE TARGET GUARD (target-guard.ts) runs FIRST, before any write: step 3 below rewrites `roleDefaults`
// unconditionally, and it once landed in the operator's LIVE dev DB. Every reachable origin must carry the
// harness stamp and must not hold a dev port, or this whole setup throws and the run dies before it writes.

import { execFileSync } from "node:child_process";
import process from "node:process";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import type { Browser } from "@playwright/test";
import { chromium, devices } from "@playwright/test";
import { openNewestChat } from "./chat-room.ts";
import type { ModeProject } from "./modes.ts";
import { DEV_TARGET_ALLOWED, LOCAL_MEMBER, LOCAL_OWNER, MODE_PROJECTS } from "./modes.ts";
import { probeTarget, targetRefusal } from "./target-guard.ts";

// A deterministic anchor card authored only when the library is empty (a wiped-and-latched DB).
const ANCHOR_HANDLE = "e2e-anchor";
const ANCHOR = {
  handle: ANCHOR_HANDLE,
  name: "E2E Anchor",
  description: "Deterministic e2e anchor character (globalSetup seed).",
  greetings: [{ text: "Hello from the e2e anchor." }],
};

interface CharacterListPage {
  readonly items: readonly { readonly id: CharacterId; readonly handle: CharacterHandle }[];
}

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

/** A batch GET query against a SPECIFIC base URL (mode-scoped — globalSetup seeds each stack by its origin). */
async function query<T>(baseUrl: string, procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}`);
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e seed: ${procedure} query failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

/** A batch mutation against a SPECIFIC base URL (the owner-fallback seam ⇒ no cookie/CSRF needed). */
async function mutation<T>(baseUrl: string, procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: input }),
  });
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e seed: ${procedure} mutation failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

/** Ensure ≥1 character exists; return the id of a usable one (prefer the anchor, else the first present). */
async function ensureCharacter(baseUrl: string): Promise<CharacterId> {
  const page = await query<CharacterListPage>(baseUrl, "character.list", {});
  const anchor = page.items.find((c) => c.handle === ANCHOR_HANDLE);
  if (anchor !== undefined) {
    return anchor.id;
  }
  const first = page.items[0];
  if (first !== undefined) {
    return first.id;
  }
  const created = await mutation<{ readonly id: CharacterId }>(baseUrl, "character.create", { input: ANCHOR });
  return created.id;
}

/** Ensure ≥1 committed chat exists (model-free) so the reuse path in support/chat-room.ts always hits. */
async function ensureChat(baseUrl: string, characterId: CharacterId): Promise<void> {
  const chats = await query<readonly unknown[]>(baseUrl, "chat.listChats", {});
  if (chats.length > 0) {
    return;
  }
  await mutation(baseUrl, "chat.startChat", { characterIds: [characterId] });
}

/** Pin every role to the local vLLM engine on its LIVE wire (the ONLY coherent local chat wire since D109). */
async function pinRouting(baseUrl: string): Promise<void> {
  await mutation(baseUrl, "settings.updateUserSettingsSection", {
    section: "routing",
    patch: {
      roleDefaults: {
        chat: { api: "chat-completions", source: "vllm" },
        agent: { api: "chat-completions", source: "vllm" },
        summarize: { api: "chat-completions", source: "vllm" },
        embed: { source: "vllm" },
        rerank: { source: "vllm" },
        imageEmbed: { source: "vllm" },
        generateImage: { source: "openrouter" },
      },
    },
  });
}

/** LOCAL mode: shell the dev multi-user seed against THIS stack's backend origin (the owner-fallback seam
 *  admits a LOOPBACK-PEER request — #298 f2 — so it hits 127.0.0.1 directly). Single source of truth for the
 *  seed sequence —
 *  resetPassword(owner) → updateAppSettings{localMultiUser:true} → createUser(member) → verify. */
function seedMultiUser(mode: ModeProject): void {
  // node runs the tool's source directly (type stripping); the tsx hop this used to take was launcher rot.
  execFileSync(process.execPath, ["tooling/src/seed/cli.ts", "multi-user"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_BASE_URL: mode.backendUrl,
      FIXTURE_OWNER_HANDLE: LOCAL_OWNER.handle,
      FIXTURE_OWNER_PASSWORD: LOCAL_OWNER.password,
      FIXTURE_MEMBER_HANDLE: LOCAL_MEMBER.handle,
      FIXTURE_MEMBER_PASSWORD: LOCAL_MEMBER.password,
    },
  });
}

/** Seed one mode-project's stack (the common library/chat/routing floor + the local multi-user seed). */
async function seedMode(mode: ModeProject): Promise<void> {
  const characterId = await ensureCharacter(mode.baseUrl);
  await ensureChat(mode.baseUrl, characterId);
  await pinRouting(mode.baseUrl);
  if (mode.seedMultiUser) {
    seedMultiUser(mode);
  }
}

// ── CLIENT WARM-UP (#571) — the second half of globalSetup's job. See `ClientWarmup` in modes.ts for WHY:
// vite's transform cache is per-process, so without this the FIRST spec of a run pays the cold transform of
// the whole route graph inside its own 60s test timeout, and that cost has crossed the budget. ──

// Two attempts, and the FIRST one is expected to be slow — it is the one paying the cold transform, and on a
// truly cold tree it can outrun any single budget we would pick (vite serves ~1.6k modules one at a time
// while the page is mid-boot, so the helpers' own actionability waits can expire before the route mounts).
// The retry re-drives the SAME path against a now-mostly-transformed graph, which is the pass that must
// succeed. A second failure THROWS: a warm-up that silently gave up would restore the exact cold-first-spec
// regression this exists to kill, so it aborts the run loudly instead.
const WARMUP_ATTEMPTS = 2;
const SHELL_WARMUP_TIMEOUT = 120_000;

/** Run one warm-up body, retrying once — the cold pass primes the transform cache for the pass that counts. */
async function warmWithRetry(mode: ModeProject, drive: () => Promise<void>, attemptsLeft: number = WARMUP_ATTEMPTS): Promise<void> {
  try {
    await drive();
  } catch (cause) {
    if (attemptsLeft <= 1) {
      throw new Error(`e2e warm-up: ${mode.name} client never settled after ${WARMUP_ATTEMPTS} attempts`, { cause });
    }
    console.warn(`e2e warm-up: ${mode.name} did not settle yet (cold transform) — ${attemptsLeft - 1} attempt(s) left`);
    await warmWithRetry(mode, drive, attemptsLeft - 1);
  }
}

/** Pre-transform ONE mode's client module graph by actually driving it in a browser (the real graph the
 *  specs walk, not a hand-listed file set). `room` modes go all the way into a chat; login-gated `shell`
 *  modes stop at `/`. Its own context per mode, so the modes stay isolated exactly as their stacks are. */
async function warmMode(browser: Browser, mode: ModeProject): Promise<void> {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL: mode.baseUrl });
  const page = await context.newPage();
  try {
    switch (mode.clientWarmup) {
      case "room":
        await warmWithRetry(mode, () => openNewestChat(page));
        break;
      case "shell":
        await warmWithRetry(mode, async (): Promise<void> => {
          await page.goto("/", { waitUntil: "load", timeout: SHELL_WARMUP_TIMEOUT });
        });
        break;
    }
  } finally {
    await context.close();
  }
}

/** Warm every booted mode in parallel (separate stacks ⇒ separate vite processes ⇒ no contention beyond CPU,
 *  and serialising them would just re-add the wall-clock this whole step exists to remove). */
async function warmClients(modes: readonly ModeProject[]): Promise<void> {
  const browser = await chromium.launch();
  try {
    await Promise.all(modes.map((mode) => warmMode(browser, mode)));
  } finally {
    await browser.close();
  }
}

/** Playwright `globalSetup` — runs once, after the webServers are up, before the first spec. Seeds EVERY
 *  mode-project's stack that actually BOOTED (a `--project=<name>`-scoped run boots only that project's
 *  webServer, so a fetch to a non-booted origin would hang — we probe /healthz first and skip the ones that
 *  don't answer). Every origin that DOES answer must pass the target guard: an unreachable mode is a skip, an
 *  unowned one is a THROW (Playwright aborts the run) — never a silent seed into someone's real data.
 *  Seeding is idempotent, so a full run seeds all three. */
export default async function globalSetup(): Promise<void> {
  // Probe every mode's origin in parallel; seed only the stacks that actually booted (distinct DBs/ports ⇒
  // seeding them concurrently is safe — no shared state).
  const probes = await Promise.all(MODE_PROJECTS.map((mode) => probeTarget(mode.backendUrl)));
  const booted = MODE_PROJECTS.map((mode, i) => ({ mode, probe: probes[i] ?? { reachable: false, stamped: false } })).filter(({ probe }) => probe.reachable);
  const refusals = booted
    .map(({ mode, probe }) => targetRefusal(mode, probe, DEV_TARGET_ALLOWED))
    .filter((message): message is string => message !== undefined);
  if (refusals.length > 0) {
    throw new Error(refusals.join("\n"));
  }
  await Promise.all(booted.map(({ mode }) => seedMode(mode)));
  // AFTER the seed, never before: the `room` warm pass opens a chat from the list, which only exists once
  // `ensureChat` has run.
  await warmClients(booted.map(({ mode }) => mode));
}
