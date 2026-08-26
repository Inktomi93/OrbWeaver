import type { ChatId } from "@orb/kit/ids";
import type { SeedProfile } from "../lib/agent-bridge.ts";

export type SeedStep = () => Promise<void>;

/** Advances only after a write resolves, so a deterministic failure-before-commit resumes at that exact
 * door instead of minting another room and orphaning the partial one. */
export class PendingGameSeed {
  readonly profile: SeedProfile;
  readonly title: string;
  readonly chatId: ChatId;

  private nextStep = 0;
  private readonly steps: readonly SeedStep[];

  constructor(profile: SeedProfile, title: string, chatId: ChatId, steps: readonly SeedStep[]) {
    this.profile = profile;
    this.title = title;
    this.chatId = chatId;
    this.steps = steps;
  }

  assertMatches(profile: SeedProfile, title: string): void {
    if (this.profile !== profile || this.title !== title) {
      throw new Error(`__orb.seed: unfinished ${this.profile} seed must be retried before starting ${profile}`);
    }
  }

  async finish(): Promise<void> {
    await this.steps.slice(this.nextStep).reduce<Promise<void>>(
      (chain, step) =>
        chain.then(step).then(() => {
          this.nextStep += 1;
        }),
      Promise.resolve(),
    );
  }
}
