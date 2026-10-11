// The relocate plan: the boundary input of `pnpm codemod relocate`, validated before any byte moves.
import { z } from "zod";

const repoPath = z
  .string()
  .min(1)
  .refine((p) => !(p.startsWith("/") || p.split("/").includes("..") || p.endsWith("/")), "a repo-relative path with no `..` and no trailing slash");

/** One move. With `route`, `from` is a directory whose files are distributed into `to/<role>/` by basename
 *  glob; every file directly in `from` must match exactly one route, and `from` may hold no subdirectory.
 *  Without `route`, `from` is a file or a whole directory renamed to `to`. */
const relocateMoveSchema = z.strictObject({
  from: repoPath,
  to: repoPath,
  route: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/u), z.array(z.string().min(1)).min(1)).optional(),
  /** Also rewrite citations spelled from the moved directory's own name (`<dir>/x.ts`), not only full
   *  repo paths. Only for a routed move whose directory name is unambiguous across the tree. */
  shortForms: z.boolean().default(false),
});

const manifestEditSchema = z.strictObject({
  exports: z.record(z.string(), z.string()).optional(),
  imports: z.record(z.string(), z.string()).optional(),
});

export const relocatePlanSchema = z.strictObject({
  moves: z.array(relocateMoveSchema).min(1),
  /** package.json `exports`/`imports` maps that replace the current ones; specifiers are re-derived against them. */
  manifests: z.record(repoPath, manifestEditSchema).default({}),
  /** Literal text replacements applied to every authored text file after the path rewrite, longest first. */
  literals: z.array(z.tuple([z.string().min(1), z.string()])).default([]),
  /** Spellings to list after the run so the operator can finish what a mechanical rewrite cannot decide. */
  residue: z.array(z.string().min(1)).default([]),
  /** Path prefixes never rewritten: generated or vendored bytes whose content is pinned elsewhere. */
  exclude: z.array(repoPath).default([]),
});

export type RelocatePlan = z.infer<typeof relocatePlanSchema>;
export type RelocateMove = z.infer<typeof relocateMoveSchema>;
export type ManifestEdit = z.infer<typeof manifestEditSchema>;

/** One package's resolution maps, as Node reads them. */
export interface WorkspacePackage {
  readonly name: string;
  /** Repo-relative directory holding the manifest ("" for the root). */
  readonly dir: string;
  readonly exports: Readonly<Record<string, string>>;
  readonly imports: Readonly<Record<string, string>>;
}

/** A relative literal the rewrite could not place, or placed outside a module-specifier position. */
export interface RelocateNote {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}
