// The trials a graph-trial run has landed, one JSON line each in a sidecar of its out file, so a run that crashes keeps
// the trials it finished and a rerun of the same commit does not try them again.
// - A record names the commit it was tried on. A tree with uncommitted changes to tracked files has no commit that
//   describes it, so it neither reads nor writes records.
// - A sidecar holding a record from another commit is refused: its verdicts belong to other code.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { runGit } from "../../floor/git/git.ts";
import type { DeclKey } from "./resolve.ts";
import type { Trial, TrialBucket, TrialLedger } from "./trial.ts";

// The trials were written by this module alone, so a record's shape is its writer's contract.
const TrialRecord = z.object({
  tree: z.string(),
  bucket: z.string(),
  key: z.string(),
  trial: z.custom<Trial>((value) => typeof value === "object" && value !== null && "verdict" in value),
});
const FailureRecord = z.object({ tree: z.string(), failure: z.string() });
const LedgerLine = z.union([TrialRecord, FailureRecord]);

const slot = (bucket: string, key: string): string => `${bucket}\t${key}`;

/** The commit a tree's trials belong to, or null when tracked files differ from it or there is no commit. */
function treeOf(root: string): string | null {
  const head = runGit(root, ["rev-parse", "HEAD"]);
  const changed = runGit(root, ["diff", "--quiet", "HEAD"]);
  return head.status === 0 && changed.status === 0 ? head.stdout.trim() : null;
}

/** A run's ledger: the trials an earlier run of the same commit kept, and the failure that ended it, as the sidecar
 *  holds them. */
export class FileLedger implements TrialLedger {
  readonly #path: string;
  readonly #tree: string | null;
  readonly #kept = new Map<string, Trial>();
  readonly #landed: Trial[] = [];
  #failure: string | null = null;

  /** @throws When the sidecar holds a record from another commit. */
  constructor(root: string, path: string) {
    this.#path = path;
    this.#tree = treeOf(root);
    if (this.#tree === null || !existsSync(path)) {
      return;
    }
    for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
      const record = LedgerLine.parse(JSON.parse(line));
      if (record.tree !== this.#tree) {
        throw new Error(`${path} holds trials from commit ${record.tree}, and this tree is at ${this.#tree}: delete it or name another --out`);
      }
      if ("trial" in record) {
        this.#kept.set(slot(record.bucket, record.key), record.trial);
        this.#landed.push(record.trial);
      } else {
        this.#failure = record.failure;
      }
    }
  }

  recorded(bucket: TrialBucket, key: DeclKey): Trial | undefined {
    return this.#kept.get(slot(bucket, key));
  }

  record(bucket: TrialBucket, key: DeclKey, trial: Trial): void {
    this.#kept.set(slot(bucket, key), trial);
    this.#landed.push(trial);
    this.#append({ bucket, key, trial });
  }

  /** Keep the failure that ended the run beside the trials it finished. */
  fail(failure: string): void {
    this.#failure = failure;
    this.#append({ failure });
  }

  /** The trials kept so far, in the order they landed, and the failure that ended the run, if one did. */
  get kept(): { readonly trials: readonly Trial[]; readonly failure: string | null } {
    return { trials: this.#landed, failure: this.#failure };
  }

  #append(record: object): void {
    if (this.#tree === null) {
      return;
    }
    mkdirSync(dirname(this.#path), { recursive: true });
    appendFileSync(this.#path, `${JSON.stringify({ tree: this.#tree, ...record })}\n`);
  }
}
