import type { ChatId } from "@orb/kit/ids";
import type { SeedProfile } from "../lib/agent-bridge.ts";

type SeedStep = () => Promise<void>;
interface GameSeedResult {
  readonly chatId: ChatId;
}

function assertSeedMatches(expectedProfile: SeedProfile, expectedTitle: string, profile: SeedProfile, title: string): void {
  if (expectedProfile !== profile || expectedTitle !== title) {
    throw new Error(`__orb.seed: unfinished ${expectedProfile} seed must be retried before starting ${profile}`);
  }
}

class GameSeedFlight {
  readonly profile: SeedProfile;
  readonly title: string;
  readonly promise: Promise<GameSeedResult>;

  constructor(profile: SeedProfile, title: string, promise: Promise<GameSeedResult>) {
    this.profile = profile;
    this.title = title;
    this.promise = promise;
  }

  assertMatches(profile: SeedProfile, title: string): void {
    assertSeedMatches(this.profile, this.title, profile, title);
  }
}

/** Owns a first or resumed seed before its first await. Matching callers join the owned promise; a
 * different request cannot pass the unfinished-seed boundary while chat prerequisites are in flight. */
export class GameSeedFlights {
  private inFlight: GameSeedFlight | null = null;

  run(profile: SeedProfile, title: string, start: () => Promise<GameSeedResult>): Promise<GameSeedResult> {
    if (this.inFlight !== null) {
      try {
        this.inFlight.assertMatches(profile, title);
      } catch (error) {
        return Promise.reject(error);
      }
      return this.inFlight.promise;
    }

    const result = Promise.withResolvers<GameSeedResult>();
    const flight = new GameSeedFlight(profile, title, result.promise);
    this.inFlight = flight;
    // @orb-waive caught-failure-ownership(flight.promise): both arms only release the inFlight pointer for bookkeeping; the rejection itself propagates through the returned `flight.promise`, which the caller awaits. Ends if `run` stops returning `flight.promise` to its caller.
    void flight.promise.then(
      () => this.release(flight),
      () => this.release(flight),
    );
    // @orb-waive caught-failure-ownership(Promise.resolve): feeds the deferred's resolve/reject, which settles `result.promise` — the same object as the returned `flight.promise` the caller awaits. Ends if `result`/`flight.promise` stop being the same object.
    void Promise.resolve().then(start).then(result.resolve, result.reject);
    return flight.promise;
  }

  private release(flight: GameSeedFlight): void {
    if (this.inFlight === flight) {
      this.inFlight = null;
    }
  }
}

/** Advances only after a write resolves, so a deterministic failure-before-commit resumes at that exact
 * door instead of minting another room and orphaning the partial one. */
export class PendingGameSeed {
  readonly profile: SeedProfile;
  readonly title: string;
  readonly chatId: ChatId;

  private finishInFlight: Promise<void> | null = null;
  private nextStep = 0;
  private readonly steps: readonly SeedStep[];

  constructor(profile: SeedProfile, title: string, chatId: ChatId, steps: readonly SeedStep[]) {
    this.profile = profile;
    this.title = title;
    this.chatId = chatId;
    this.steps = steps;
  }

  assertMatches(profile: SeedProfile, title: string): void {
    assertSeedMatches(this.profile, this.title, profile, title);
  }

  releaseOwnership(current: PendingGameSeed | null): PendingGameSeed | null {
    return current === this ? null : current;
  }

  finish(): Promise<void> {
    this.finishInFlight ??= this.advance();
    return this.finishInFlight;
  }

  private async advance(): Promise<void> {
    try {
      await this.steps.slice(this.nextStep).reduce<Promise<void>>(
        (chain, step) =>
          chain.then(step).then(() => {
            this.nextStep += 1;
          }),
        Promise.resolve(),
      );
    } finally {
      this.finishInFlight = null;
    }
  }
}
