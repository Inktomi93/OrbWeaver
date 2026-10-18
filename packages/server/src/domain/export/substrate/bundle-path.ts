// domain/export/substrate/bundle-path — one archive path per library-bundle entry. Producers name files
// independently (a card by its display name), so two rows can share a path that a restored folder cannot
// hold; a case-insensitive disk also folds case variants together. A colliding path gets the first free
// numeric suffix before its extension; a path no earlier entry took is never renamed.

const FIRST_SUFFIX = 2;

function withSuffix(path: string, suffix: number): string {
  const leaf = path.lastIndexOf("/") + 1;
  const dot = path.lastIndexOf(".");
  // Only a dot inside the leaf name, after its first character, starts an extension.
  const stemEnd = dot > leaf ? dot : path.length;
  return `${path.slice(0, stemEnd)}-${String(suffix)}${path.slice(stemEnd)}`;
}

/** A per-bundle allocator: each call returns `path`, or its first suffixed variant no earlier call returned. */
export function createBundlePaths(): (path: string) => string {
  const taken = new Set<string>();
  return (path: string): string => {
    let candidate = path;
    for (let suffix = FIRST_SUFFIX; taken.has(candidate.toLowerCase()); suffix++) {
      candidate = withSuffix(path, suffix);
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  };
}
