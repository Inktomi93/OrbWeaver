// Every background write is magic-enforced; a live URL cap is optional for already-imported bytes.
import type { BackgroundStoreDeps, StoreBackground } from "../contract/background-store.ts";

export function createBackgroundStore(deps: BackgroundStoreDeps): StoreBackground {
  return (params) => deps.store({ ...params, kind: "background", enforceMagic: true, ...(deps.maxBytes === undefined ? {} : { maxBytes: deps.maxBytes() }) });
}
