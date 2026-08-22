// The kit's fail-loud error (a class, so `instanceof` survives module boundaries) + the shared
// text-replacement/operation shapes' error vocabulary. Split from codemod-kit.ts (P4 of #393).
/**
 * The base error class every codemod helper throws on user-visible failures.
 * Carries a `hint` field with a one-line remediation suggestion — codemods
 * are usually run interactively, so a clear next step is high-leverage.
 */
export class CodemodError extends Error {
  readonly hint: string;
  constructor(message: string, hint = "(no hint)") {
    super(`${message}\n  → ${hint}`);
    this.name = "CodemodError";
    this.hint = hint;
  }
}
