// The model picker's view model (inference program §5.3a Essential tier: "model (listed; typed fallback with
// its copy)", §7.4 for the policy). The picker never reads a catalog itself. Its caller hands it a
// `ModelCatalogSource`, so the saved-key path (`connection.catalogModels`), the endpoint draft
// (`connection.listEndpointModels`) and any later draft read feed one control through one shape.
//
// THE TYPED-ID POLICY IS THE PROVIDER'S CATALOG STRATEGY (§7.4). A `url` catalog is a fetched list that can lag
// the provider, so a typed id is always offered beside it and saved `modelListed: false`. A `builtin` catalog
// IS the set the in-process runtime can run, so a typed id there names a model nothing can load.

import type { ModelCatalogEntry, ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";

/** Where the picker's models come from, as the caller last saw it. `unlisted` is a source with no list to
 *  offer (nothing fetched yet, or no catalog door for this draft); `failed` is a list read that errored.
 *  NOT an exported alias: a feature's `lib/` is not a type home (`no-inline-types`), so every reader derives
 *  it from `ModelCatalogPickerProps["source"]`, and a new arm is a `tsc` error at each of them. */
type ModelCatalogSource =
  | { readonly status: "loading" }
  | { readonly status: "listed"; readonly models: readonly ModelCatalogEntry[] }
  | { readonly status: "failed"; readonly reason: string; readonly retry: (() => void) | null }
  | { readonly status: "unlisted"; readonly reason: string };

/** Whether this provider's policy permits a model id the list does not carry (§7.4). */
export function typedModelAllowed(provider: Pick<ProviderDef, "catalog">): boolean {
  return provider.catalog === "url";
}

/** A catalog row's display name. Most `/v1/models` lists carry no name, so theirs is the id. */
export function modelEntryLabel(entry: Pick<ModelCatalogEntry, "id" | "name">): string {
  return entry.name.trim() === "" ? entry.id : entry.name;
}

/** Whether the row carries a name worth showing beside its id. */
export function showsModelId(entry: Pick<ModelCatalogEntry, "id" | "name">): boolean {
  return modelEntryLabel(entry) !== entry.id;
}

/** Whether `modelId` came from the source's list — the connection's `modelListed` on save. */
export function isListedModel(source: ModelCatalogSource, modelId: string): boolean {
  const id = modelId.trim();
  return source.status === "listed" && id !== "" && source.models.some((entry) => entry.id === id);
}

/** The id the explicit "use as typed" option would write, or `null` when it is not offered: policy forbids
 *  it, nothing is typed, or the typed text already IS a listed id (the list row is the honest choice). */
export function typedOption(args: { readonly term: string; readonly models: readonly ModelCatalogEntry[]; readonly allowed: boolean }): string | null {
  const id = args.term.trim();
  if (!args.allowed || id === "" || args.models.some((entry) => entry.id === id)) {
    return null;
  }
  return id;
}

/** §5.3a's `modelListed: false` sentence, verbatim, naming whose list the id was missing from. */
export function unlistedModelSentence(listOwner: string): string {
  return `This model id wasn't in ${listOwner}'s list. It'll be sent as-is; if the server doesn't have it, turns will fail.`;
}

/** What the picker renders for a source. `notice: null` is the searchable list (`models: null` while it
 *  loads); a notice is the typed arm, which offers a text field only when `typingOffered`. */
export interface ModelPickerView {
  readonly models: readonly ModelCatalogEntry[] | null;
  readonly notice: string | null;
  /** The notice reports a list that failed or came back empty, not the caller's own "type it" reason. */
  readonly warns: boolean;
  readonly typingOffered: boolean;
  readonly retry: (() => void) | null;
}

const LIST_VIEW_LOADING: ModelPickerView = { models: null, notice: null, warns: false, typingOffered: false, retry: null };

/** The typed arm for a list that WAS read and gave nothing to pick: the consequence is spelled out, and a
 *  closed catalog says there is nothing to type instead. */
function emptyListView(notice: string, typedAllowed: boolean, retry: (() => void) | null): ModelPickerView {
  const tail = typedAllowed ? "Type the id; it'll be sent as-is." : "This provider only runs models from its list, so there is nothing to type instead.";
  return { models: null, notice: `${notice} ${tail}`, warns: true, typingOffered: typedAllowed, retry };
}

/** The picker's arm for a source. With no list read at all there is nothing to hold an id against, so the
 *  unlisted arm offers typing whatever the policy; the caller's reason already says what to type. */
export function modelPickerView(source: ModelCatalogSource, args: { readonly listOwner: string; readonly typedAllowed: boolean }): ModelPickerView {
  switch (source.status) {
    case "loading":
      return LIST_VIEW_LOADING;
    case "listed":
      return source.models.length === 0
        ? emptyListView(`${args.listOwner} listed no models.`, args.typedAllowed, null)
        : { models: source.models, notice: null, warns: false, typingOffered: false, retry: null };
    case "failed":
      return emptyListView(`Couldn't list ${args.listOwner}'s models — ${source.reason}.`, args.typedAllowed, source.retry);
    case "unlisted":
      return { models: null, notice: source.reason, warns: false, typingOffered: true, retry: null };
  }
}

/** A catalog read's error as a source the picker can render. */
export function failedCatalogSource(error: unknown, retry: (() => void) | null): ModelCatalogSource {
  return { status: "failed", reason: errorMessage(error), retry };
}

/** The endpoint draft's list answer as a source. The verb never throws for a failed dial: it answers
 *  `listed: false` with the reason, which is the failed arm with the typed field beside it. */
export function endpointListSource(result: {
  readonly listed: boolean;
  readonly models: readonly ModelCatalogEntry[];
  readonly reason: string | null;
}): ModelCatalogSource {
  return result.listed ? { status: "listed", models: result.models } : { status: "failed", reason: result.reason ?? "no answer", retry: null };
}

/** The model field's required-value message, shared by every form that writes a connection's model. */
export const MODEL_REQUIRED_MESSAGE = "Pick a model or type its id.";
