// Env key names that code outside the env parse reads or sets by name. Zero imports, so a launcher or a tool
// that only needs a key's spelling never loads the schema and its graph (`../record/index.ts` re-exports these).

export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";
export const DEBUG_TOKEN_ENV = "DEBUG_TOKEN";
export const LOCAL_INITIAL_PASSWORD_ENV = "LOCAL_INITIAL_PASSWORD";
