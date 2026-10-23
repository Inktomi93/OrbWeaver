// Atlas guest requests run against a scripted external host under the real realm denial.
// The private date evaluator is test-owned; no application authorization or persistence is simulated.
import vm from "node:vm";
import type { PluginHostV1 } from "@orb/contracts/plugin";
import type { CharacterId, SandboxWireId } from "@orb/kit/ids";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { bootShowcase, mainSourceOf } from "./showcase-guest.ts";

const FIXED_EPOCH = 1_700_000_000_000;

/** A canned wire body, served for any URL containing `match` (the hub's API path). */
export interface CannedResponse {
  readonly match: string;
  readonly body: unknown;
}

/** One `host.ui.setState` call the guest made. */
interface AtlasPublish {
  readonly id: string;
  readonly state: Record<string, unknown>;
}

/** One `host.ui.toast` the guest ASKED for — recorded whether or not the harness then refuses it. */
interface AtlasToast {
  readonly level: string;
  readonly message: string;
}

/** What the harness hands back — recorded guest requests and the public action driver. */
export interface AtlasDrive {
  readonly published: AtlasPublish[];
  readonly logs: string[];
  readonly fetched: string[];
  readonly toasts: AtlasToast[];
  /** Every `character.ingest`/`ingestAsset` result the guest was handed, in order. */
  readonly ingests: string[];
  /** Requested provenance stamps, by characterId. */
  readonly cardData: Map<string, unknown>;
  /** The scripted KV state records guest requests; it is not application persistence. */
  readonly kv: Map<string, string>;
  readonly act: (actionId: string, values: Record<string, string>, completed: (state: Record<string, unknown>) => boolean) => Promise<void>;
}

/** The controlled result returned at the guest's external ingest boundary. */
type AtlasIngestOutcome = Awaited<ReturnType<PluginHostV1["character"]["ingest"]>>;

export interface AtlasBootOptions {
  /** The canned wire. Default: none — every fetch 404s. */
  readonly responses?: readonly CannedResponse[];
  /** The grants the fake host reports. Default: the browse trio (`storage.kv`, `ui.surface`, `net.fetch`). */
  readonly grants?: readonly string[];
  /** Supplied ⇒ `host.character.ingest` answers it (and `ingestAsset` rejects, so the guest folds to the
   *  JSON arm the way a PNG-less hub does). Absent ⇒ there is no character plane at all. */
  readonly ingest?: (card: unknown) => AtlasIngestOutcome;
  /** Throw to script an external toast refusal; this does not implement host rate admission. */
  readonly onToast?: (toast: AtlasToast, index: number) => void;
}

const DEFAULT_GRANTS: readonly string[] = ["storage.kv", "ui.surface", "net.fetch"];

/** Boot the real `main.js` under the realm's denial with the given wire + host surface, activation included. */
export async function bootAtlas(options: AtlasBootOptions = {}): Promise<AtlasDrive> {
  const responses = options.responses ?? [];
  const published: AtlasPublish[] = [];
  const ready = Promise.withResolvers<void>();
  let observe: ((state: Record<string, unknown>) => void) | undefined;
  const logs: string[] = [];
  const fetched: string[] = [];
  const toasts: AtlasToast[] = [];
  const ingests: string[] = [];
  const cardData = new Map<string, unknown>();
  const kv = new Map<string, string>();
  let onAction: NonNullable<Parameters<PluginHostV1["ui"]["register"]>[0]["onAction"]> | null = null;
  const ingest = options.ingest;
  const character =
    ingest === undefined
      ? {}
      : {
          ingest: (card: unknown): Promise<AtlasIngestOutcome> => {
            const outcome = ingest(card);
            ingests.push(outcome.characterId);
            return Promise.resolve(outcome);
          },
          // This selection exercises the JSON fold, not the art-import plane.
          ingestAsset: (): Promise<never> => Promise.reject(new Error("no art plane in this harness")),
          setCardData: (characterId: SandboxWireId<CharacterId>, data: unknown): Promise<void> => {
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
      register: (registration: Parameters<PluginHostV1["ui"]["register"]>[0]): void => {
        onAction = registration.onAction ?? null;
      },
      setState: (id: string, state: Record<string, unknown>): Promise<void> => {
        published.push({ id, state });
        if (id === "atlas_page") {
          ready.resolve();
          observe?.(state);
        }
        return Promise.resolve();
      },
      // Record before refusal so a rejected notification still proves the guest requested it.
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
  await bootShowcase("card-atlas", surface, ready.promise);
  const act: AtlasDrive["act"] = async (actionId, values, completed): Promise<void> => {
    if (onAction === null) {
      throw new Error("the atlas registered no page");
    }
    const publication = Promise.withResolvers<void>();
    observe = (state): void => {
      if (completed(state)) {
        publication.resolve();
      }
    };
    try {
      await onAction({ actionId, values, chat: null });
      await publication.promise;
    } finally {
      observe = undefined;
    }
  };
  return { published, logs, fetched, toasts, ingests, cardData, kv, act };
}

/** The guest's most recent publish — the state the page is showing. */
export function lastAtlasState(drive: AtlasDrive): Record<string, unknown> {
  const last = drive.published.at(-1);
  if (last === undefined) {
    throw new Error("nothing published");
  }
  return last.state;
}

/** Exercise only the private guest date calculations without activating its UI or inventing a product door. */
export async function bootAtlasDates(): Promise<{ readonly epochMs: (value: unknown) => unknown; readonly fmtDate: (ms: number) => unknown }> {
  const source = await mainSourceOf("card-atlas");
  const ctx = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, ctx);
  ctx["orb"] = {
    host: (major: number): object => {
      if (major !== 1) {
        throw new Error("HostVersionError");
      }
      return { grants: [], log: { info: (): void => undefined, warn: (): void => undefined } };
    },
  };
  vm.runInContext(source, ctx, { filename: "card-atlas-date-guest.js" });
  const epochMs: unknown = ctx["epochMs"];
  const fmtDate: unknown = ctx["fmtDate"];
  if (typeof epochMs !== "function" || typeof fmtDate !== "function") {
    throw new Error("card-atlas bundle has no private date engine");
  }
  return { epochMs: (value): unknown => epochMs(value), fmtDate: (ms): unknown => fmtDate(ms) };
}
