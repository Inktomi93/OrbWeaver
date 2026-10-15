/** Ordinary private stages preserve runtime lineage; durable publications remove private runtime state and refuse known-value echoes. */
export interface StageCloneOptions {
  readonly publication?: { readonly privateLiterals: readonly string[] };
}
