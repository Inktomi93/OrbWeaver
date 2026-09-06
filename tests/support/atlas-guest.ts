// THE CARD-ATLAS GUEST HARNESS — the REAL shipped `main.js` running in a bare `node:vm` context under the
// realm's OWN exported `AMBIENT_STUBS`, over a fake `orb.host(1)`.
//
// WHY THE DENIAL COMES FROM THE REALM AND NOT FROM HERE (#805): the five "parked" hubs of the v1.3 live drive
// were the five whose row builders fed an ISO date to `Date.parse`, which the plugin sandbox replaces with a
// throwing stub — and the offline harness that had "proved the adapters correct" ran with a LIVE `Date`. So
// this harness evaluates the realm's own stub text in the context; the denial IS the realm's, never a copy
// that can drift.
//
// EXTRACTED HERE (#1698) because a SECOND suite needs it. `seed-atlas-realm-dates.suite.test.ts` drives the
// search/open path with no character plane; `seed-atlas-import-outcome.suite.test.ts` drives the ADD path,
// which needs an ingest surface, the `character.ingest` grant, and a toast that is allowed to REFUSE (the
// host's real one is rate-limited and throws). Everything that differs between them is an option below;
// everything that must not drift — the realm denial, the vm floor, the settle discipline — is shared.
//
// WHAT THE REAL SANDBOX ADDS (marshalling, caps, the belts) is pinned in `tests/server/infra/plugin-host/`;
// the atlas's registration + activation publish in the REAL sandbox is `seed-example-plugins.int.test.ts`.

import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";

const MAIN_JS = new URL("../../packages/showcase-plugins/bundles/card-atlas/main.js", import.meta.url);
const FIXED_EPOCH = 1_700_000_000_000;
/** Macrotask spins per settle — enough for the guest's floated search/open continuations to land. */
const SETTLE_TICKS = 24;

/** A canned wire body, served for any URL containing `match` (the hub's API path). */
export interface CannedResponse {
  readonly match: string;
  readonly body: unknown;
}

/** One `host.ui.setState` call the guest made. */
export interface AtlasPublish {
  readonly id: string;
  readonly state: Record<string, unknown>;
}

/** One `host.ui.toast` the guest ASKED for — recorded whether or not the harness then refuses it. */
export interface AtlasToast {
  readonly level: string;
  readonly message: string;
}

/** What the harness hands back — everything the guest did, plus the two doors into it. */
export interface AtlasDrive {
  readonly published: AtlasPublish[];
  readonly logs: string[];
  readonly fetched: string[];
  readonly toasts: AtlasToast[];
  /** Every `character.ingest`/`ingestAsset` result the guest was handed, in order. */
  readonly ingests: string[];
  /** `character.setCardData` writes, by characterId — the PROVENANCE stamp's receipt. */
  readonly cardData: Map<string, unknown>;
  /** The guest's private `storage.kv` — the owned index lives here. */
  readonly kv: Map<string, string>;
  readonly act: (actionId: string, values: Record<string, string>) => Promise<void>;
  /** Call a top-level guest function by name (the date engine's own entry points). */
  readonly call: (name: string, ...args: unknown[]) => unknown;
}

/** What one ingest answers: the character it landed on, and whether this call CREATED it. */
export interface AtlasIngestOutcome {
  // @orb-waive brand-in-name-position(characterId): the guest SANDBOX wire — the fake host hands the guest the same bare string host-v1's `characterId` is, and the guest reads it with no brand validation; branding it would claim a check this boundary never performs. Ends if host-v1 brands its characterId.
  readonly characterId: string;
  readonly created: boolean;
}

export interface AtlasBootOptions {
  /** The canned wire. Default: none — every fetch 404s. */
  readonly responses?: readonly CannedResponse[];
  /** The grants the fake host reports. Default: the browse trio (`storage.kv`, `ui.surface`, `net.fetch`). */
  readonly grants?: readonly string[];
  /** Supplied ⇒ `host.character.ingest` answers it (and `ingestAsset` rejects, so the guest folds to the
   *  JSON arm the way a PNG-less hub does). Absent ⇒ there is no character plane at all. */
  readonly ingest?: (card: unknown) => AtlasIngestOutcome;
  /** Supplied ⇒ `host.ui.toast` calls it and may THROW — which is exactly what the real outbox does when a
   *  plugin is inside its per-plugin cooldown. Default: every toast succeeds. */
  readonly onToast?: (toast: AtlasToast, index: number) => void;
}

/** Spin the macrotask queue so a floated guest continuation lands. */
async function settle(): Promise<void> {
  for (let i = 0; i < SETTLE_TICKS; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const DEFAULT_GRANTS: readonly string[] = ["storage.kv", "ui.surface", "net.fetch"];

/** Boot the real `main.js` under the realm's denial with the given wire + host surface, activation included. */
export async function bootAtlas(options: AtlasBootOptions = {}): Promise<AtlasDrive> {
  const responses = options.responses ?? [];
  const source = await readFile(MAIN_JS, "utf8");
  const published: AtlasPublish[] = [];
  const logs: string[] = [];
  const fetched: string[] = [];
  const toasts: AtlasToast[] = [];
  const ingests: string[] = [];
  const cardData = new Map<string, unknown>();
  const kv = new Map<string, string>();
  let onAction: ((action: { actionId: string; values: Record<string, string> }) => Promise<void>) | null = null;
  const character =
    options.ingest === undefined
      ? {}
      : {
          ingest: (card: unknown): Promise<AtlasIngestOutcome> => {
            const outcome = (options.ingest as (c: unknown) => AtlasIngestOutcome)(card);
            ingests.push(outcome.characterId);
            return Promise.resolve(outcome);
          },
          // No art plane here: the guest's PNG-first arm folds to the JSON arm on rejection, which is the
          // path a PNG-less hub takes in production too.
          ingestAsset: (): Promise<never> => Promise.reject(new Error("no art plane in this harness")),
          // @orb-waive brand-in-name-position(characterId): the guest SANDBOX wire — the fake host hands the guest the same bare string host-v1's `characterId` is, and the guest reads it with no brand validation; branding it would claim a check this boundary never performs. Ends if host-v1 brands its characterId.
          setCardData: (characterId: string, data: unknown): Promise<void> => {
            cardData.set(characterId, data);
            return Promise.resolve();
          },
        };
  const surface = {
    version: 1,
    grants: [...(options.grants ?? DEFAULT_GRANTS)],
    clock: { nowEpochMs: (): number => FIXED_EPOCH },
    random: { next: (): number => 0.5 },
    ids: { mint: (): string => "id-0" },
    log: {
      info: (message: string): void => void logs.push(`[info] ${message}`),
      warn: (message: string): void => void logs.push(`[warn] ${message}`),
      error: (message: string): void => void logs.push(`[error] ${message}`),
    },
    tokens: { count: (): number => 0 },
    ui: {
      register: (registration: { onAction: typeof onAction }): void => {
        onAction = registration.onAction;
      },
      setState: (id: string, state: Record<string, unknown>): Promise<void> => {
        published.push({ id, state });
        return Promise.resolve();
      },
      // RECORDED BEFORE THE REFUSAL, deliberately: "which notices did the guest ASK for" and "which ones
      // landed" are different questions, and the cooldown arm needs the first one.
      toast: (level: string, message: string): Promise<void> => {
        const toast: AtlasToast = { level, message };
        const index = toasts.length;
        toasts.push(toast);
        try {
          options.onToast?.(toast, index);
        } catch (err) {
          return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
        return Promise.resolve();
      },
    },
    storage: {
      get: (key: string): Promise<string | null> => Promise.resolve(kv.get(key) ?? null),
      set: (key: string, value: string): Promise<void> => {
        kv.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string): Promise<void> => {
        kv.delete(key);
        return Promise.resolve();
      },
      list: (): Promise<string[]> => Promise.resolve([...kv.keys()]),
    },
    net: {
      fetch: (url: string): Promise<{ status: number; body: string }> => {
        fetched.push(url);
        const hit = responses.find((response) => url.includes(response.match));
        return Promise.resolve(hit === undefined ? { status: 404, body: "" } : { status: 200, body: JSON.stringify(hit.body) });
      },
      fetchAsset: (): Promise<never> => Promise.reject(new Error("no art plane in this harness")),
    },
    character,
  };
  const ctx = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, ctx);
  ctx["orb"] = {
    host: (major: number): typeof surface => {
      if (major !== 1) {
        throw new Error("HostVersionError");
      }
      return surface;
    },
  };
  vm.runInContext(source, ctx, { filename: "plugin-guest.js" });
  await settle();
  const act = async (actionId: string, values: Record<string, string>): Promise<void> => {
    if (onAction === null) {
      throw new Error("the atlas registered no page");
    }
    await onAction({ actionId, values });
    await settle();
  };
  const call = (name: string, ...args: unknown[]): unknown => {
    const fn: unknown = ctx[name];
    if (typeof fn !== "function") {
      throw new Error(`guest has no top-level function ${name}`);
    }
    return fn(...args);
  };
  return { published, logs, fetched, toasts, ingests, cardData, kv, act, call };
}

/** The guest's most recent publish — the state the page is showing. */
export function lastAtlasState(drive: AtlasDrive): Record<string, unknown> {
  const last = drive.published.at(-1);
  if (last === undefined) {
    throw new Error("nothing published");
  }
  return last.state;
}
