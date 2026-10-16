// Actual public factories reject unclassified names through every typed reference to their API.
import { createEntityDraftStore, createPersistedStore as persisted } from "@orb/client/state";

declare const state: typeof import("@orb/client/state");

const initial = (): { readonly count: number } => ({ count: 0 });
const options = { version: 1, migrate: initial, partialize: initial };
declare const unclassified: string;

persisted("shell", initial, options);
createEntityDraftStore({ name: "character-card" });
// @ts-expect-error device-local names require a production classification
persisted("unclassified-store", initial, options);
// @ts-expect-error widening a literal cannot grant a device-local classification
persisted("shell" as string, initial, options);
// @ts-expect-error arbitrary names cannot enter through an imported alias
persisted(unclassified, initial, options);
// @ts-expect-error the namespace export retains the same closed name contract
state.createPersistedStore("unclassified-store", initial, options);
// @ts-expect-error draft options use the same canonical name vocabulary
createEntityDraftStore({ name: "unclassified-draft" });
// @ts-expect-error inferred option bags cannot widen the draft name contract
createEntityDraftStore({ name: unclassified });
const forwarded = state.createEntityDraftStore;
// @ts-expect-error a forwarded callable retains the closed name contract
forwarded({ name: "unclassified-draft" });
function wrapper(name: string): void {
  // @ts-expect-error a wrapper cannot admit broader names than the production API
  persisted(name, initial, options);
}
void wrapper;

function createPersistedStore(name: string): string {
  return name;
}
createPersistedStore("unrelated-local-function");
