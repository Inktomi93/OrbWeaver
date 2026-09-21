import { dirname, posix } from "node:path";
import type { SemanticWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { canonicalCompilerPath } from "@orb/tooling/_shared/ts-workspace";
import type { Project, SourceFile, StringLiteral } from "ts-morph";
import { CodemodError } from "./errors.ts";
import { repoRelative } from "./plans.ts";

const RELATIVE_SPECIFIER = /^\.{1,2}\//u;
const MODULE_EXTENSION = /(\.d\.[cm]?ts|\.[cm]?[jt]sx?|\.json)$/u;
const INDEX_BASENAME = "/index";

export interface ResolvedMove {
  readonly fromAbs: string;
  readonly toAbs: string;
  readonly sf: SourceFile;
}

interface ModuleRelation {
  readonly owner: SourceFile;
  readonly target: SourceFile;
  readonly originalSpecifier: string;
  readonly start: number;
  readonly end: number;
}

interface SourceRewrite {
  readonly sourceFile: SourceFile;
  readonly stagedText: string;
  readonly finalText: string;
  readonly needsRestore: boolean;
}

function withoutModuleExtension(path: string): string {
  return path.replace(MODULE_EXTENSION, "");
}

/** TypeScript resolves both `./x.js` → `x.ts` and `./dir` → `dir/index.ts`; this stem is only a
 *  fail-closed ambiguity detector for literals the compiler did NOT resolve, never a rewrite rule. */
function moduleStem(path: string): string {
  const withoutExtension = withoutModuleExtension(path);
  return withoutExtension.endsWith(INDEX_BASENAME) ? withoutExtension.slice(0, -INDEX_BASENAME.length) : withoutExtension;
}

function replaceLiteralRanges(source: string, relations: readonly ModuleRelation[], replacement: (relation: ModuleRelation, index: number) => string): string {
  let text = source;
  const descending = relations.toSorted((left, right) => right.start - left.start);
  for (const [index, relation] of descending.entries()) {
    text = `${text.slice(0, relation.start)}${replacement(relation, index)}${text.slice(relation.end)}`;
  }
  return text;
}

function resolvedMoveRelation(opts: {
  literal: StringLiteral;
  targetPath: string;
  moving: ReadonlySet<string>;
  project: Project;
  repoRoot: string;
}): ModuleRelation | undefined {
  const { literal, targetPath, moving, project, repoRoot } = opts;
  const ownerPath = canonicalCompilerPath(repoRoot, literal.getSourceFile().getFilePath());
  const originalSpecifier = literal.getLiteralText();
  if (!(RELATIVE_SPECIFIER.test(originalSpecifier) && (moving.has(ownerPath) || moving.has(targetPath)))) {
    return;
  }
  const owner = project.getSourceFile(ownerPath);
  const target = project.getSourceFile(targetPath);
  if (owner === undefined || target === undefined) {
    throw new CodemodError(
      `moveFiles: native compiler relation reaches outside the editable project (${repoRelative(ownerPath, repoRoot)} → ${repoRelative(targetPath, repoRoot)}).`,
      "Add every authored importer and target to createCodemodProject's globs before moving files.",
    );
  }
  return { owner, target, originalSpecifier, start: literal.getStart() + 1, end: literal.getEnd() - 1 };
}

export function resolvedMoveRelations(
  workspace: SemanticWorkspace,
  project: Project,
  moves: readonly ResolvedMove[],
  repoRoot: string,
): readonly ModuleRelation[] {
  const moving = new Set(moves.map((move) => canonicalCompilerPath(repoRoot, move.fromAbs)));
  const relations = new Map<string, ModuleRelation>();
  for (const program of workspace.programs) {
    for (const semanticTarget of program.project().getSourceFiles()) {
      const targetPath = canonicalCompilerPath(repoRoot, semanticTarget.getFilePath());
      for (const literal of semanticTarget.getReferencingLiteralsInOtherSourceFiles()) {
        const relation = resolvedMoveRelation({ literal, targetPath, moving, project, repoRoot });
        if (relation !== undefined) {
          relations.set(`${relation.owner.getFilePath()}\0${String(relation.start)}\0${String(relation.end)}\0${relation.target.getFilePath()}`, relation);
        }
      }
    }
  }
  return [...relations.values()];
}

function unresolvedMoveTargetDetail(opts: {
  owner: SourceFile;
  specifier: string;
  directoryChanging: ReadonlySet<string>;
  movesByStem: ReadonlyMap<string, readonly ResolvedMove[]>;
  repoRoot: string;
}): string | undefined {
  const { owner, specifier, directoryChanging, movesByStem, repoRoot } = opts;
  const possibleTargets = movesByStem.get(moduleStem(posix.resolve(posix.dirname(owner.getFilePath()), specifier))) ?? [];
  if (!directoryChanging.has(canonicalCompilerPath(repoRoot, owner.getFilePath())) && possibleTargets.length === 0) {
    return;
  }
  return possibleTargets.length === 0
    ? "its target is outside the loaded project"
    : `it could name ${possibleTargets.map((move) => repoRelative(move.fromAbs, repoRoot)).join(", ")}`;
}

function assertNoUnresolvedInSource(opts: {
  owner: SourceFile;
  ownerPath: string;
  visited: Set<string>;
  resolvedLiterals: ReadonlySet<string>;
  directoryChanging: ReadonlySet<string>;
  movesByStem: ReadonlyMap<string, readonly ResolvedMove[]>;
  repoRoot: string;
}): void {
  const { owner, ownerPath, visited, resolvedLiterals, directoryChanging, movesByStem, repoRoot } = opts;
  for (const literal of owner.getImportStringLiterals()) {
    const specifier = literal.getLiteralText();
    const start = literal.getStart() + 1;
    const end = literal.getEnd() - 1;
    const identity = `${ownerPath}\0${String(start)}\0${String(end)}`;
    if (visited.has(identity) || !RELATIVE_SPECIFIER.test(specifier) || resolvedLiterals.has(identity)) {
      continue;
    }
    visited.add(identity);
    const targetDetail = unresolvedMoveTargetDetail({ owner, specifier, directoryChanging, movesByStem, repoRoot });
    if (targetDetail !== undefined) {
      throw new CodemodError(
        `moveFiles: unresolved relative module specifier ${JSON.stringify(specifier)} in ${repoRelative(owner.getFilePath(), repoRoot)}; ${targetDetail}.`,
        "Add the target to createCodemodProject's globs or rewrite the specifier in an explicit plan. moveFiles only rewrites compiler-resolved module identities.",
      );
    }
  }
}

export function assertNoUnresolvedMoveRelations(opts: {
  workspace: SemanticWorkspace;
  project: Project;
  moves: readonly ResolvedMove[];
  resolved: readonly ModuleRelation[];
  repoRoot: string;
}): void {
  const { workspace, project, moves, resolved, repoRoot } = opts;
  const resolvedLiterals = new Set(
    resolved.map((relation) => `${canonicalCompilerPath(repoRoot, relation.owner.getFilePath())}\0${String(relation.start)}\0${String(relation.end)}`),
  );
  const movesByStem = new Map<string, ResolvedMove[]>();
  for (const move of moves) {
    const stem = moduleStem(move.fromAbs);
    const matches = movesByStem.get(stem) ?? [];
    matches.push(move);
    movesByStem.set(stem, matches);
  }
  const directoryChanging = new Set(
    moves.filter((move) => dirname(move.fromAbs) !== dirname(move.toAbs)).map((move) => canonicalCompilerPath(repoRoot, move.fromAbs)),
  );
  const visited = new Set<string>();
  for (const program of workspace.programs) {
    for (const semanticOwner of program.project().getSourceFiles()) {
      const ownerPath = canonicalCompilerPath(repoRoot, semanticOwner.getFilePath());
      const owner = project.getSourceFile(ownerPath);
      if (owner !== undefined) {
        assertNoUnresolvedInSource({ owner, ownerPath, visited, resolvedLiterals, directoryChanging, movesByStem, repoRoot });
      }
    }
  }
}

function relativeModuleSpecifier(ownerPath: string, targetPath: string, originalSpecifier: string): string {
  const ownerDirectory = posix.dirname(ownerPath);
  const extension = MODULE_EXTENSION.exec(originalSpecifier)?.[0] ?? "";
  const relative = withoutModuleExtension(posix.relative(ownerDirectory, targetPath));
  return `${relative.startsWith("../") ? relative : `./${relative}`}${extension}`;
}

export function sourceRewrites(moves: readonly ResolvedMove[], relations: readonly ModuleRelation[]): readonly SourceRewrite[] {
  const finalPaths = new Map(moves.map((move) => [move.sf, move.toAbs]));
  const grouped = new Map<SourceFile, ModuleRelation[]>();
  for (const relation of relations) {
    const entries = grouped.get(relation.owner) ?? [];
    entries.push(relation);
    grouped.set(relation.owner, entries);
  }
  return [...grouped].map(([sourceFile, sourceRelations]) => {
    const originalText = sourceFile.getFullText();
    const finalSpecifiers = new Map(
      sourceRelations.map((relation) => [
        relation,
        relativeModuleSpecifier(
          finalPaths.get(relation.owner) ?? relation.owner.getFilePath(),
          finalPaths.get(relation.target) ?? relation.target.getFilePath(),
          relation.originalSpecifier,
        ),
      ]),
    );
    const needsSentinel = (relation: ModuleRelation): boolean => finalPaths.has(relation.owner);
    const needsRestore = sourceRelations.some(needsSentinel);
    return {
      sourceFile,
      stagedText: replaceLiteralRanges(originalText, sourceRelations, (relation, index) =>
        needsSentinel(relation) ? `__orb_codemod_move_${index}__` : (finalSpecifiers.get(relation) ?? relation.originalSpecifier),
      ),
      finalText: replaceLiteralRanges(originalText, sourceRelations, (relation) => finalSpecifiers.get(relation) ?? relation.originalSpecifier),
      needsRestore,
    };
  });
}
