// E2E globalSetup — establishes KNOWN DB state over each mode-project's tRPC API BEFORE any spec runs, so the
// suite stops depending on ambient DB drift (the reason a wiped/latched library silently reddened the whole
// suite — see the Playwright e2e speedup report, Finding 2). Runs ONCE (Playwright globalSetup),
// AFTER every project's webServer is up; it iterates the mode projects (support/modes.ts) and seeds EACH
// stack by its own origin. Per mode:
//   1. ≥1 CHARACTER exists — the library→chat flow needs a card. The boot seeder is a one-shot per-user latch;
//      a wiped library won't re-seed, so if the API reports zero we author a deterministic anchor.
//   2. ≥1 committed CHAT with ≥1 durable message — the persistence/sequence/injection/multi-tab specs reuse
//      an existing chat; seeding one model-free (chat.startChat, then a title write that claims the husk)
//      keeps the non-live suite MODEL-FREE.
//   3. Chat + Utility bind to an owned scripted endpoint by default; only explicit E2E_LIVE selects the
//      shared local model engine. Routine setup never discovers or generates against the operator's model.
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
// THE TARGET GUARD (target-guard.ts) runs FIRST, before any write: step 3 below AUTHORS A ROW and re-points
// the `chat` Model role unconditionally, and its predecessor once landed in the operator's LIVE dev DB. Every
// reachable origin must carry the harness stamp and must not hold a dev port, or this whole setup throws and
// the run dies before it writes.

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import type { ModelListing } from "@orb/contracts/inference";
import type { CharacterHandle, CharacterId, ChatId } from "@orb/kit/ids";
import type { Browser, Request } from "@playwright/test";
import { chromium, devices } from "@playwright/test";
import { APP_READY_ATTRIBUTE, openNewestChat, waitForAppReady } from "./chat-room.ts";
import { startFixtureProvider } from "./fixture-provider.ts";
import type { ModeProject } from "./modes.ts";
import {
  DEV_TARGET_ALLOWED,
  E2E_LOCAL_ENGINE_BASE_URL,
  E2E_LOCAL_ENGINE_FALLBACK_MODEL,
  E2E_LOCAL_ENGINE_LABEL,
  E2E_LOCAL_ENGINE_PROVIDER,
  LOCAL_MEMBER,
  LOCAL_OWNER,
  selectedModeProjects,
} from "./modes.ts";
import { probeTarget, targetRefusal } from "./target-guard.ts";
// TYPE-ONLY: `trpc.ts` is bound to the single-user origin at runtime, while this module seeds each mode by
// its OWN origin — importing the create-input SHAPE keeps the literal below under that file's mirror pin
// without borrowing its client.
import type { NewConnection } from "./trpc.ts";

// A deterministic anchor card authored only when the library is empty (a wiped-and-latched DB).
const ANCHOR_HANDLE = "e2e-anchor";
const ANCHOR = {
  handle: ANCHOR_HANDLE,
  name: "E2E Anchor",
  description: "Deterministic e2e anchor character (globalSetup seed).",
  greetings: [{ text: "Hello from the e2e anchor." }],
};
// The title that claims the seeded chat out of husk state (see `ensureChat`).
const SEED_CHAT_TITLE = "E2E seed chat";

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

/** Ensure ≥1 LISTED chat exists (model-free) so the reuse path in support/chat-room.ts always hits.
 *  `chat.startChat` mints a husk, which every Chats list hides; the title write claims it. `totalCount`
 *  counts the same husk-free scope the list renders. */
async function ensureChat(baseUrl: string, characterId: CharacterId): Promise<void> {
  const listed = await query<{ readonly totalCount: number }>(baseUrl, "chat.listChats", {});
  if (listed.totalCount > 0) {
    return;
  }
  const started = await mutation<{ readonly chat: { readonly id: ChatId } }>(baseUrl, "chat.startChat", { characterIds: [characterId] });
  await mutation(baseUrl, "chat.updateTitle", { chatId: started.chat.id, title: SEED_CHAT_TITLE });
}

/** A `user_connections` row as this seed reads it back (`connection.list` / `connection.create`). */
interface SeededConnection {
  readonly id: string;
  readonly label: string;
}

/** The row to author, with its model resolved the way the PANE resolves one (§7.4): ask the endpoint's own
 *  `/v1/models` server-side, take the first id it lists, else write the declared fallback with
 *  no model check — the product's typed-id arm, not a fabrication. The non-live suite is model-free and
 *  only needs the row + binding to exist, so a fleet that is down must not abort the whole run; a @live spec
 *  against a down fleet fails on its own turn, where it belongs. Called ONLY when the row is missing, so a
 *  re-run against a surviving DB costs no dial. */
async function engineConnectionInput(baseUrl: string): Promise<NewConnection> {
  // `connection.draftCatalogModels` NEVER throws for a failed dial (it comes back `listed: false` + a reason), so
  // the seed branches on it instead of guarding it.
  const listing = await mutation<ModelListing>(baseUrl, "connection.draftCatalogModels", {
    providerId: E2E_LOCAL_ENGINE_PROVIDER,
    baseUrl: E2E_LOCAL_ENGINE_BASE_URL,
  });
  const first = listing.listed ? listing.models[0] : undefined;
  return {
    label: E2E_LOCAL_ENGINE_LABEL,
    providerId: E2E_LOCAL_ENGINE_PROVIDER,
    credentialId: null,
    baseUrl: E2E_LOCAL_ENGINE_BASE_URL,
    model: first?.id ?? E2E_LOCAL_ENGINE_FALLBACK_MODEL,
    ...(first === undefined ? {} : { modelCheck: "listed" }),
    // `summarize` is `spend: "background"`; without this the binding below is refused inline (`canFund`, F5).
    allowBackground: true,
  };
}

/**
 * Bind Chat and Utility to the owned scripted endpoint, or the explicitly opted-in local engine.
 *
 * WHY A CONNECTION AND NOT A SETTINGS PATCH: `routing` left `USER_SETTINGS_SECTIONS` with the inference
 * program — a per-task model pick is a `connection_bindings` row pointing at a `user_connections` row
 * (§3.2/§7.1), and there are NO defaults (§7.2), so a stack with no connection reads `no-connection` on
 * every task. This step is what makes a @live turn possible at all.
 *
 * IDEMPOTENT BY LOOKUP, NOT BY REFUSAL: `connection.create` collision-suffixes a duplicate `(owner, label)`
 * (`mintLabel`) instead of refusing it, so a second run against a surviving DB would mint
 * `e2e local engine (2)` and the specs' label lookup would still find the first. The seed therefore LISTS
 * first and reuses the row it finds.
 *
 * WHICH ROLES: `chat` and `summarize` only.
 *   • `embed` / `rerank` are ALREADY BOUND for every user — boot seeds two `local-light` connections and
 *     their bindings (§7.2, `persistence/local-light-seed.ts`). Re-pointing them at a text engine would both
 *     overwrite a user's own pick on a dev-target drive and be refused anyway (a `generation`-kind row cannot
 *     serve a vector task, `connectionTasks`).
 *   • `imageEmbed` is left UNBOUND for the same servability reason — no local image-embedding connection
 *     exists on this box, and inventing one pointed at the generation engine would be a lie the first
 *     `requireServable` call would reject.
 *   • `generateImage` is left UNBOUND: no local provider serves it (the old seed pointed it at `openrouter`,
 *     which needs a hosted key the harness has no business minting). A spec that needs it must say so.
 * `summarize` is `spend: "background"`, so the row is created with `allowBackground: true` — otherwise the
 * binding is refused inline (`canFund`, F5).
 */
async function pinChatConnection(baseUrl: string, fixtureBaseUrl?: string): Promise<void> {
  if (fixtureBaseUrl !== undefined) {
    const row = await mutation<SeededConnection>(baseUrl, "connection.create", {
      label: "e2e scripted default",
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: fixtureBaseUrl,
      model: "fixture-default",
      allowBackground: true,
    });
    for (const task of ["chat", "summarize"]) {
      await mutation(baseUrl, "connection.setBinding", { task, connectionId: row.id });
    }
    return;
  }
  const existing = (await query<readonly SeededConnection[]>(baseUrl, "connection.list", undefined)).find(
    (connection) => connection.label === E2E_LOCAL_ENGINE_LABEL,
  );
  const row = existing ?? (await mutation<SeededConnection>(baseUrl, "connection.create", await engineConnectionInput(baseUrl)));
  for (const task of ["chat", "summarize"]) {
    await mutation(baseUrl, "connection.setBinding", { task, connectionId: row.id });
  }
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

/** Seed one mode-project's stack (the common library/chat/connection floor + the local multi-user seed). */
async function seedMode(mode: ModeProject, fixtureBaseUrl?: string): Promise<void> {
  const characterId = await ensureCharacter(mode.baseUrl);
  await ensureChat(mode.baseUrl, characterId);
  await pinChatConnection(mode.baseUrl, fixtureBaseUrl);
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
const READY_EVENT_PREFIX = "e2e-ready:";
const WARMUP_REPORT_DIR = "reports/e2e-results";
const DIAGNOSTIC_SAMPLE_COUNT = 5;
const DIAGNOSTIC_SAMPLE_LENGTH = 250;

/** Complete startup evidence; thrown errors carry bounded samples instead of this full record. */
export interface WarmupDiagnostics {
  readonly elapsedMs: number;
  readonly path: string;
  readonly loads: readonly number[];
  readonly navigations: readonly { readonly elapsedMs: number; readonly path: string }[];
  readonly readiness: readonly { readonly elapsedMs: number; readonly state: string }[];
  readonly failures: readonly string[];
  readonly pendingRequests: readonly string[];
}

function diagnosticSample(entries: readonly string[]): readonly string[] {
  return entries.slice(0, DIAGNOSTIC_SAMPLE_COUNT).map((entry) => entry.slice(0, DIAGNOSTIC_SAMPLE_LENGTH));
}

/** Run one warm-up body, retrying once — the cold pass primes the transform cache for the pass that counts. */
async function warmWithRetry(mode: ModeProject, drive: () => Promise<void>, attemptsLeft: number = WARMUP_ATTEMPTS): Promise<void> {
  try {
    await drive();
  } catch (cause) {
    if (attemptsLeft <= 1) {
      throw new Error(`e2e warm-up: ${mode.name} client never settled after ${WARMUP_ATTEMPTS} attempts`, { cause });
    }
    console.warn(`e2e warm-up: ${mode.name} failed — ${attemptsLeft - 1} attempt(s) left: ${cause instanceof Error ? cause.message : String(cause)}`);
    await warmWithRetry(mode, drive, attemptsLeft - 1);
  }
}

/** Pre-transform ONE mode's client module graph by actually driving it in a browser (the real graph the
 *  specs walk, not a hand-listed file set). `room` modes go all the way into a chat; login-gated `shell`
 *  modes stop at `/`. Its own context per mode, so the modes stay isolated exactly as their stacks are. */
async function warmMode(browser: Browser, mode: ModeProject, reportDir: string): Promise<void> {
  await mkdir(reportDir, { recursive: true });
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL: mode.baseUrl });
  const page = await context.newPage();
  const pending = new Set<Request>();
  const failures: string[] = [];
  const loads: number[] = [];
  const navigations: { readonly elapsedMs: number; readonly path: string }[] = [];
  const readiness: { readonly elapsedMs: number; readonly state: string }[] = [];
  const started = performance.now();
  const elapsedMs = (): number => Math.round(performance.now() - started);
  const reportPath = `${reportDir}/warmup-${mode.name}.json`;
  const diagnostics = (): WarmupDiagnostics => ({
    elapsedMs: elapsedMs(),
    path: new URL(page.url()).pathname,
    loads,
    navigations,
    readiness,
    failures,
    pendingRequests: [...pending].map((request) => new URL(request.url()).pathname),
  });
  await page.addInitScript(
    ({ attribute, prefix }) => {
      let previous: string | null | undefined;
      const observer = new MutationObserver(() => {
        const ready = document.documentElement?.getAttribute(attribute) ?? null;
        if (ready !== previous) {
          previous = ready;
          const state = ready ?? "missing";
          console.debug(`${prefix}${state === "" ? "settled" : state}`);
        }
        if (ready === "") {
          observer.disconnect();
        }
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: [attribute] });
    },
    { attribute: APP_READY_ATTRIBUTE, prefix: READY_EVENT_PREFIX },
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      // Console-only import failures can carry full URLs; query and fragment state are not diagnostic evidence.
      failures.push(`Console: ${message.text().replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gu, "$1")}`);
    } else if (message.text().startsWith(READY_EVENT_PREFIX)) {
      readiness.push({ elapsedMs: elapsedMs(), state: message.text().slice(READY_EVENT_PREFIX.length) });
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push({ elapsedMs: elapsedMs(), path: new URL(frame.url()).pathname });
    }
  });
  page.on("request", (request) => pending.add(request));
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => {
    pending.delete(request);
    failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? "request failed"}`);
  });
  page.on("pageerror", (error) => failures.push(`JavaScript: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`HTTP ${String(response.status())}: ${new URL(response.url()).pathname}`);
    }
  });
  page.on("load", () => loads.push(elapsedMs()));
  // The room drive navigates through shared helpers with no timeout of their own; on a cold, small runner
  // the first transform outlasts Playwright's 30s navigation default, which is exactly the cost this pays.
  page.setDefaultNavigationTimeout(SHELL_WARMUP_TIMEOUT);
  let bootError: Error | null = null;
  try {
    switch (mode.clientWarmup) {
      case "room":
        await warmWithRetry(mode, () => openNewestChat(page));
        break;
      case "shell":
        await warmWithRetry(mode, async (): Promise<void> => {
          await page.goto("/", { waitUntil: "load", timeout: SHELL_WARMUP_TIMEOUT });
          await waitForAppReady(page);
        });
        break;
    }
    console.info(`e2e warm-up: ${mode.name} settled in ${String(elapsedMs())}ms; diagnostics: ${reportPath}`);
  } catch (cause) {
    const state = diagnostics();
    const summary = JSON.stringify({
      elapsedMs: state.elapsedMs,
      failureCount: state.failures.length,
      failureSample: diagnosticSample(state.failures),
      pendingRequestCount: state.pendingRequests.length,
      pendingRequestSample: diagnosticSample(state.pendingRequests),
    });
    bootError = new Error(`e2e warm-up: ${mode.name} boot diagnostics: ${summary}; artifact: ${reportPath}`, { cause });
  } finally {
    try {
      await writeFile(reportPath, JSON.stringify(diagnostics(), null, 2));
    } catch (cause) {
      const reportCause = bootError === null ? cause : new AggregateError([bootError, cause], "Boot and diagnostic report failed", { cause });
      bootError = new Error(`e2e warm-up: ${mode.name} could not write ${reportPath}`, { cause: reportCause });
    } finally {
      await context.close();
    }
  }
  if (bootError !== null) {
    throw bootError;
  }
}

/** Warm every booted mode in parallel (separate stacks ⇒ separate vite processes ⇒ no contention beyond CPU,
 *  and serialising them would just re-add the wall-clock this whole step exists to remove). */
async function warmClients(modes: readonly ModeProject[], reportDir: string = WARMUP_REPORT_DIR): Promise<void> {
  const browser = await chromium.launch();
  try {
    const outcomes = await Promise.allSettled(modes.map((mode) => warmMode(browser, mode, reportDir)));
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        `e2e warm-up: ${String(failures.length)} mode(s) failed\n${failures.map((failure) => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason))).join("\n")}`,
      );
    }
  } finally {
    await browser.close();
  }
}

export { warmClients as __warmClientsForTest };

/** Playwright `globalSetup` — runs once, after the webServers are up, before the first spec. Seeds EVERY
 *  mode-project's stack that actually BOOTED (a `--project=<name>`-scoped run boots only that project's
 *  webServer, so a fetch to a non-booted origin would hang — we probe /healthz first and skip the ones that
 *  don't answer). Every origin that DOES answer must pass the target guard: an unreachable mode is a skip, an
 *  unowned one is a THROW (Playwright aborts the run) — never a silent seed into someone's real data.
 *  Seeding is idempotent, so a full run seeds all three. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  // Probe only selected modes; an unrelated stamped harness is not owned by this run (distinct DBs/ports ⇒
  // seeding them concurrently is safe — no shared state).
  const selected = selectedModeProjects(process.argv);
  const probes = await Promise.all(selected.map((mode) => probeTarget(mode.backendUrl)));
  const booted = selected.map((mode, i) => ({ mode, probe: probes[i] ?? { reachable: false, stamped: false } })).filter(({ probe }) => probe.reachable);
  const refusals = booted
    .map(({ mode, probe }) => targetRefusal(mode, probe, DEV_TARGET_ALLOWED))
    .filter((message): message is string => message !== undefined);
  if (refusals.length > 0) {
    throw new Error(refusals.join("\n"));
  }
  // Routine selection cannot discover or generate against the operator's model engine.
  const fixture = process.env["E2E_LIVE"] === "1" ? undefined : await startFixtureProvider(0, []);
  try {
    await Promise.all(booted.map(({ mode }) => seedMode(mode, fixture?.baseUrl)));
    // AFTER the seed, never before: the `room` warm pass opens a chat from the list, which only exists once
    // `ensureChat` has run.
    await warmClients(booted.map(({ mode }) => mode));
  } catch (error) {
    await fixture?.close();
    throw error;
  }
  return async (): Promise<void> => {
    await fixture?.close();
  };
}
