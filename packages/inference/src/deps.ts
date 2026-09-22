// The intentional package-root composition seam (§11 / D15). Its shapes live in `contract/runtime.ts`;
// this exact root module is the stable assembly import and contains no second type home.

export type {
  BindingActor,
  BindingStore,
  ConnectionStore,
  InferenceDeps,
  InferenceLog,
  ProviderStore,
  SnapshotStore,
  SpanAttrs,
  SpanFn,
  SuperviseDetached,
} from "./contract/runtime.ts";
