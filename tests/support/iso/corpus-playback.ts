// Capture minting is private to validated hydration and the real root producer. Playback checks
// runtime identity and immutable binding; public inspection fields never authorize a response.
import type { UserId } from "@orb/kit/ids";
import type { CorpusCapture } from "./corpus-capture.ts";

const UNADMITTED = "Unadmitted corpus capture";
interface CaptureIdentity {
  readonly path: string;
  readonly viewerUserId: UserId;
}
const identities = new WeakMap<object, CaptureIdentity>();
const immutableGraphs = new WeakSet<object>();

function freezeGraph(value: unknown): void {
  if (value === null || typeof value !== "object" || immutableGraphs.has(value)) {
    return;
  }
  immutableGraphs.add(value);
  for (const key of Object.keys(value)) {
    const child: unknown = Reflect.get(value, key);
    freezeGraph(child);
  }
  Object.freeze(value);
}

/** Bind the exact request before its operation can await and a caller can mutate its input. */
export function lockCorpusInput<Input>(input: Input): Input {
  freezeGraph(input);
  return input;
}

class PlaybackCapture<Input, Output> {
  readonly #binding: CorpusCapture<Input, Output>;
  readonly input: Input;
  readonly output: Output;

  constructor(identity: CaptureIdentity, binding: CorpusCapture<Input, Output>) {
    this.#binding = { input: binding.input, output: binding.output };
    freezeGraph(this.#binding);
    this.input = this.#binding.input;
    this.output = this.#binding.output;
    identities.set(this, Object.freeze(identity));
    Object.freeze(this);
  }

  read(): CorpusCapture<Input, Output> {
    return this.#binding;
  }
}

/** Admitted identity is nominal; spreading the enumerable wire inspection fields creates plain data. */
export type CorpusPlaybackCapture<Input, Output> = PlaybackCapture<Input, Output>;

/** Keep the raw publication graph's shape while replacing its capture pairs with admitted identities. */
export type CorpusPlaybackView<Value> = Value extends string | number | boolean | bigint | symbol | null | undefined
  ? Value
  : Value extends CorpusCapture<infer Input, infer Output>
    ? CorpusPlaybackCapture<Input, Output>
    : Value extends object
      ? { [Key in keyof Value]: CorpusPlaybackView<Value[Key]> }
      : Value;

/** Only validated hydration and the root-owned procedure capture may call this private mint. */
export function admitCorpusCapture<Input, Output>(
  path: string,
  viewerUserId: UserId,
  binding: CorpusCapture<Input, Output>,
): CorpusPlaybackCapture<Input, Output> {
  return new PlaybackCapture({ path, viewerUserId }, binding);
}

/** Validate custody before reading the private binding, including casts and same-shaped cross-path records. */
export function readCorpusCapture<Input, Output>(
  path: string,
  viewerUserId: UserId,
  capture: CorpusPlaybackCapture<Input, Output>,
): CorpusCapture<Input, Output> {
  const identity = identities.get(capture);
  if (identity === undefined) {
    throw new Error(UNADMITTED);
  }
  if (identity.path !== path) {
    throw new Error(`Corpus capture path does not match ${path}`);
  }
  if (identity.viewerUserId !== viewerUserId) {
    throw new Error(`Corpus snapshot viewer does not match ${path}`);
  }
  return capture.read();
}
