// Authored-path identity. This is the ONE place in the runtime that resolves a selector a policy supplies,
// and it deliberately reads no bytes: `lstat`/`realpath` only, so the widest input in the contract buys the
// narrowest answer.
//
// THE ORDER OF THE TWO CONTAINMENT TESTS IS THE WHOLE POINT. Lexical containment catches `../outside` and an
// absolute selector aimed elsewhere. It does NOT catch the case this door was built for: a selector that is
// lexically inside the repository but reaches outside THROUGH A SYMLINK. Git lists a symlink as an ordinary
// tracked path and `trackedFiles()` returns repo paths, so that escape satisfies every membership check
// available to a policy and silently PASSES (`gates/runner-config-path-liveness.ts:23-31`). Hence the second
// test, against the REALPATH of both the root and the target, exactly as `resolveExactRows` does today.
//
// The root is realpathed too, and separately, because the invocation root can itself be reached through a
// symlink — a worktree under `.claude/worktrees/` regularly is. Comparing a realpathed target against a
// LEXICAL root reports every path in such a checkout as outside, which is a false positive that would fire
// on every run in exactly the environment this repository's lanes work in.
//
// A reason string never echoes the resolved external target: the verdict a policy needs is "this selector
// left the repository", and printing where it landed turns a liveness finding into a disclosure.
import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad } from "../contract/resource.ts";
import type { AuthoredPathIdentity, AuthoredPathIndex, AuthoredPathSelectorForm } from "../contract/resource-path.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function contained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function repoRelative(root: string, target: string): string {
  const rel = relative(root, target);
  return rel === "" ? "." : rel.split(sep).join("/");
}

interface Subject {
  readonly selector: string;
  readonly form: AuthoredPathSelectorForm;
  readonly path: string;
  readonly targetAbs: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Classify an existing, contained tree node. A socket, FIFO or device node exists and is neither a file
 *  nor a directory — an answer this door cannot give, stated as such rather than folded into `absent`,
 *  which would read as a dead selector a policy would tell someone to delete. */
function nodeIdentity(subject: Subject, entry: { isFile: () => boolean; isDirectory: () => boolean }): AuthoredPathIdentity {
  const { selector, form, path } = subject;
  if (entry.isFile()) {
    return { selector, form, status: "file", path };
  }
  if (entry.isDirectory()) {
    return { selector, form, status: "directory", path };
  }
  return { selector, form, status: "unresolved", reason: "selector names a tree node that is neither a file nor a directory" };
}

/** The symlink half — containment against the REALPATH of both ends, then the node kind behind the link. */
function linkIdentity(rootReal: string, subject: Subject): AuthoredPathIdentity {
  const { selector, form, path, targetAbs } = subject;
  let canonical: string;
  // @orb-waive caught-failure-ownership(catch): resource-path stat error: ENOENT is the expected missing-file signal; all other errors re-throw at L71
  try {
    canonical = realpathSync(targetAbs);
  } catch {
    // A DANGLING symlink names nothing, which is the same verdict as a path that was never there.
    return { selector, form, status: "absent", path };
  }
  if (!contained(rootReal, canonical)) {
    return { selector, form, status: "outside", reason: "selector resolves outside the repository root through a symbolic link" };
  }
  // @orb-waive caught-failure-ownership(error): resource-path resolution: error surfaces as a structured tool-error; the broken path is excluded from the resource set
  try {
    return nodeIdentity(subject, statSync(targetAbs));
  } catch (error) {
    return { selector, form, status: "unresolved", reason: message(error) };
  }
}

function identify(rootAbs: string, rootReal: string, selector: string): AuthoredPathIdentity {
  const form: AuthoredPathSelectorForm = isAbsolute(selector) ? "absolute" : "repo-relative";
  const targetAbs = resolve(rootAbs, selector);
  if (!contained(rootAbs, targetAbs)) {
    return { selector, form, status: "outside", reason: "selector normalizes outside the repository root" };
  }
  const subject: Subject = { selector, form, path: repoRelative(rootAbs, targetAbs), targetAbs };
  let link: ReturnType<typeof lstatSync>;
  // @orb-waive caught-failure-ownership(error): resource-path resolution: error surfaces as a structured tool-error; the broken path is excluded from the resource set
  try {
    link = lstatSync(targetAbs);
  } catch (error) {
    // ENOENT is the ordinary DEAD-selector answer and is not a failure of this door; anything else is.
    const absent = error instanceof Error && "code" in error && error.code === "ENOENT";
    return absent ? { selector, form, status: "absent", path: subject.path } : { selector, form, status: "unresolved", reason: message(error) };
  }
  return link.isSymbolicLink() ? linkIdentity(rootReal, subject) : nodeIdentity(subject, link);
}

/** Resolve every demanded selector. The partition is TOTAL: one identity per distinct selector, always. */
export function loadAuthoredPaths(root: string, selectors: readonly string[]): ResourceLoad<AuthoredPathIndex> {
  const distinct = [...new Set(selectors)].toSorted((left, right) => left.localeCompare(right));
  if (distinct.length === 0) {
    return { status: "empty", paths: [], members: 0, reason: "authored-path identity was demanded for zero selectors" };
  }
  const rootAbs = resolve(root);
  let rootReal: string;
  try {
    rootReal = realpathSync(rootAbs);
  } catch (error) {
    return {
      status: "unresolved",
      paths: [],
      members: 0,
      reason: `invocation root cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const identities = distinct.map((selector) => identify(rootAbs, rootReal, selector));
  // `paths` stays EMPTY on purpose. A demand door owns no population, and publishing the selectors it just
  // judged as resource paths would put a dead or escaping selector into the policy's effective population —
  // which is the opposite of the verdict it was asked for.
  return { status: "ready", value: { identities }, paths: [], members: identities.length };
}
