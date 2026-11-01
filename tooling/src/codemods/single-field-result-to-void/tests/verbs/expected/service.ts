export interface Service {
  readonly createScript: (params: CreateParams) => Promise<ScriptRow>;
  /** DB CASCADE clears every junction row. */
  readonly removeScript: (params: RemoveParams) => Promise<void>;
  readonly otherRemove: (params: RemoveParams) => Promise<RemoveResult>;
}
