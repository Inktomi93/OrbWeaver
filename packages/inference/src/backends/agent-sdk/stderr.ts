// Hold incomplete credential spellings across chunks; truncate only already-scrubbed diagnostic text.
import { redactKnownSecrets, secretRedactionLiterals } from "@orb/kit/secret-redaction";
import { sanitizeApiError } from "../http/sanitize.ts";
import { redactSecretsFromText } from "../wire/openai-body.ts";

const TAIL_CHARS = 2048;

export class SdkStderr {
  private pending = "";
  private safe = "";
  private readonly literals: readonly string[];
  private readonly secrets: readonly string[];
  private readonly forward: ((text: string) => void) | undefined;
  constructor(secrets: readonly string[], forward?: (text: string) => void) {
    this.secrets = secrets;
    this.forward = forward;
    this.literals = secretRedactionLiterals(secrets);
  }
  append(text: string): string {
    const safe = redactKnownSecrets(this.pending + text, this.secrets);
    let retained = 0;
    for (const literal of this.literals) {
      for (let size = Math.min(literal.length - 1, safe.length); size > retained; size -= 1) {
        if (safe.endsWith(literal.slice(0, size))) {
          retained = size;
          break;
        }
      }
    }
    const boundary = safe.length - retained;
    const published = this.publish(safe.slice(0, boundary));
    this.pending = safe.slice(boundary);
    return published;
  }

  end(): string {
    const published = this.publish(this.pending.length === 0 ? "" : redactKnownSecrets(this.pending, [this.pending]));
    this.pending = "";
    return published;
  }
  tail(): string {
    return sanitizeApiError(this.safe, TAIL_CHARS);
  }
  private publish(text: string): string {
    const safe = redactSecretsFromText(text, this.secrets);
    this.safe = (this.safe + safe).slice(-TAIL_CHARS);
    if (safe.length > 0) {
      this.forward?.(safe);
    }
    return safe;
  }
}
