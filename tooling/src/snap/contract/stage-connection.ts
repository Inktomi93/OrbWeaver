// What `--stage-connection` may name: the box's local model engine, or a repository env key whose value becomes the
// stage owner's credential. A live turn runs on Sonnet 5 or the local engine, so each hosted key picks Sonnet 5.
import type { PrivateText } from "./disk-safe-argv.ts";

/** The choice that binds the box's local generation engine; it needs no key. */
export const STAGE_LOCAL_ENGINE = "local";

/** The repository env keys a stage connection may be seeded from, by name. */
export const STAGE_CONNECTION_KEY_NAMES = ["OPENROUTER_API_KEY", "OPENROUTER_PROBE_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_PROBE_KEY"] as const;
export type StageConnectionKeyName = (typeof STAGE_CONNECTION_KEY_NAMES)[number];

/** Every seeded credential and connection label starts with this; a later run finds its own rows by the label. */
export const STAGE_CONNECTION_LABEL_PREFIX = "snap stage";

/** Every value `--stage-connection` takes. */
export const STAGE_CONNECTION_CHOICES = [STAGE_LOCAL_ENGINE, ...STAGE_CONNECTION_KEY_NAMES] as const;
export type StageConnectionChoice = (typeof STAGE_CONNECTION_CHOICES)[number];

/** The provider a hosted key is sealed for and the model its connection picks. */
export interface StageHostedConnection {
  readonly providerId: string;
  readonly model: string;
}

const OPENROUTER_SONNET: StageHostedConnection = { providerId: "openrouter", model: "anthropic/claude-sonnet-5" };
const ANTHROPIC_SONNET: StageHostedConnection = { providerId: "anthropic", model: "claude-sonnet-5" };

export const STAGE_HOSTED_CONNECTIONS: Readonly<Record<StageConnectionKeyName, StageHostedConnection>> = {
  ["OPENROUTER_API_KEY"]: OPENROUTER_SONNET,
  ["OPENROUTER_PROBE_KEY"]: OPENROUTER_SONNET,
  ["ANTHROPIC_API_KEY"]: ANTHROPIC_SONNET,
  ["ANTHROPIC_PROBE_KEY"]: ANTHROPIC_SONNET,
};

/** A resolved choice: the local engine's endpoint, or a key's value held private. */
export type StageConnectionSeed =
  | { readonly kind: "local"; readonly baseUrl: string }
  | { readonly kind: "key"; readonly name: StageConnectionKeyName; readonly key: PrivateText };

/** The connection the seed bound to the stage owner's chat role. It holds no key. */
export interface SeededStageConnection {
  readonly label: string;
  readonly providerId: string;
  readonly model: string;
}
