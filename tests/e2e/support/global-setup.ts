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
import process from "node:process";
import { authMeSchema, viewerViewSchema } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import { loginLocal } from "./actors.ts";
import { startFixtureProvider } from "./fixture-provider.ts";
import type { ModeProject } from "./modes.ts";
import {
  CORPUS_LOCAL_PASSWORDS,
  DEV_TARGET_ALLOWED,
  E2E_LOCAL_ENGINE_BASE_URL,
  E2E_LOCAL_ENGINE_FALLBACK_MODEL,
  E2E_LOCAL_ENGINE_LABEL,
  E2E_LOCAL_ENGINE_PROVIDER,
  LOCAL_MEMBER,
  LOCAL_OWNER,
  SELECTED_CORPUS_FIXTURE,
  SELECTED_LOCAL_CORPUS_FIXTURE,
  selectedModeProjects,
} from "./modes.ts";
import { probeTarget, targetRefusal } from "./target-guard.ts";
// TYPE-ONLY: `trpc.ts` is bound to the single-user origin at runtime, while this module seeds each mode by
// its OWN origin — importing the create-input SHAPE keeps the literal below under that file's mirror pin
// without borrowing its client.
import type { NewConnection } from "./trpc.ts";
import { createTrpcClient } from "./trpc.ts";

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

/** Ensure ≥1 character exists; return the id of a usable one (prefer the anchor, else the first present). */
async function ensureCharacter(baseUrl: string): Promise<CharacterId> {
  const page = await createTrpcClient(baseUrl).character.list.query({});
  const anchor = page.items.find((c) => c.handle === ANCHOR_HANDLE);
  if (anchor !== undefined) {
    return anchor.id;
  }
  const first = page.items[0];
  if (first !== undefined) {
    return first.id;
  }
  const created = await createTrpcClient(baseUrl).character.create.mutate({ input: ANCHOR });
  return created.id;
}

/** Ensure ≥1 LISTED chat exists (model-free) so the reuse path in support/chat-room.ts always hits.
 *  `chat.startChat` mints a husk, which every Chats list hides; the title write claims it. `totalCount`
 *  counts the same husk-free scope the list renders. */
async function ensureChat(baseUrl: string, characterId: CharacterId): Promise<void> {
  const listed = await createTrpcClient(baseUrl).chat.listChats.query({});
  if (listed.totalCount > 0) {
    return;
  }
  const started = await createTrpcClient(baseUrl).chat.startChat.mutate({ characterIds: [characterId] });
  await createTrpcClient(baseUrl).chat.updateTitle.mutate({ chatId: started.chat.id, title: SEED_CHAT_TITLE });
}

/** The row to author, with its model resolved the way the PANE resolves one (§7.4): ask the endpoint's own
 *  `/v1/models` server-side, take the first id it lists, else write the declared fallback with
 *  no model check — the product's typed-id arm, not a fabrication. The non-live suite is model-free and
 *  only needs the row + binding to exist, so a fleet that is down must not abort the whole run; a `@live` spec
 *  against a down fleet fails on its own turn, where it belongs. Called ONLY when the row is missing, so a
 *  re-run against a surviving DB costs no dial. */
async function engineConnectionInput(baseUrl: string): Promise<NewConnection> {
  // `connection.draftCatalogModels` NEVER throws for a failed dial (it comes back `listed: false` + a reason), so
  // the seed branches on it instead of guarding it.
  const listing = await createTrpcClient(baseUrl).connection.draftCatalogModels.mutate({
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
 * every task. This step is what makes a `@live` turn possible at all.
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
    const row = await createTrpcClient(baseUrl).connection.create.mutate({
      label: "e2e scripted default",
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: fixtureBaseUrl,
      model: "fixture-default",
      allowBackground: true,
    });
    for (const task of ["chat", "summarize"] as const) {
      await createTrpcClient(baseUrl).connection.setBinding.mutate({ task, connectionId: row.id });
    }
    return;
  }
  const existing = (await createTrpcClient(baseUrl).connection.list.query()).find((connection) => connection.label === E2E_LOCAL_ENGINE_LABEL);
  const row = existing ?? (await createTrpcClient(baseUrl).connection.create.mutate(await engineConnectionInput(baseUrl)));
  for (const task of ["chat", "summarize"] as const) {
    await createTrpcClient(baseUrl).connection.setBinding.mutate({ task, connectionId: row.id });
  }
}

/** LOCAL mode: shell the dev multi-user seed against THIS stack's backend origin (the owner-fallback seam
 *  admits a LOOPBACK-PEER request — #298 f2 — so it hits 127.0.0.1 directly). Single source of truth for the
 *  seed sequence —
 *  resetPassword(owner) → updateAppSettings(`{ localMultiUser: true }`) → createUser(member) → verify. */
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

async function seedCorpusLocal(mode: ModeProject): Promise<void> {
  const wire = SELECTED_LOCAL_CORPUS_FIXTURE?.wire;
  const ownerCapture = wire?.reads["sessions.me"][0]?.output;
  const owner = ownerCapture === undefined ? undefined : viewerViewSchema.parse(ownerCapture);
  const member = wire?.memberIdentities?.sharedMember.viewer;
  const ownerPassword = CORPUS_LOCAL_PASSWORDS.owner;
  const memberPassword = CORPUS_LOCAL_PASSWORDS.member;
  if (owner === undefined || member === undefined || ownerPassword === undefined || memberPassword === undefined) {
    throw new Error("Corpus local admission requires its cloned humans and run-owned credentials");
  }
  const client = createTrpcClient(mode.backendUrl);
  await client.settings.updateAppSettings.mutate({ partial: { localMultiUser: true } });
  for (const [viewer, password] of [
    [owner, ownerPassword],
    [member, memberPassword],
  ] as const) {
    await client.admin.resetPassword.mutate({ userId: viewer.userId, password });
    const actor = await loginLocal(mode.backendUrl, viewer.handle, password);
    const session = await createTrpcClient(mode.backendUrl, { ...actor.headers, forwarded: "" }).sessions.me.query(undefined);
    const response = await fetch(`${mode.backendUrl}/api/auth/me`, { headers: { ...actor.headers, forwarded: "" } });
    const identity = authMeSchema.parse(await response.json());
    if (
      !(response.ok && identity.authenticated) ||
      identity.handle !== viewer.handle ||
      identity.role !== viewer.globalRole ||
      session.userId !== viewer.userId ||
      session.handle !== viewer.handle ||
      session.globalRole !== viewer.globalRole
    ) {
      throw new Error("Corpus local cookie did not authenticate the captured human");
    }
  }
}

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
  const fixture = process.env["E2E_LIVE"] === "1" || SELECTED_CORPUS_FIXTURE !== undefined ? undefined : await startFixtureProvider(0, []);
  try {
    if (SELECTED_CORPUS_FIXTURE === undefined) {
      await Promise.all(booted.map(({ mode }) => seedMode(mode, fixture?.baseUrl)));
    } else {
      for (const { mode } of booted.filter((candidate) => candidate.mode.name === "local")) {
        await seedCorpusLocal(mode);
      }
    }
  } catch (error) {
    await fixture?.close();
    throw error;
  }
  return async (): Promise<void> => {
    await fixture?.close();
  };
}
