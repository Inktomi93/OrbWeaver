// Sessions, stage provenance and apply outcomes come from the real refinery and character owners.
import { createCharacterSchema } from "@orb/contracts/character";
import { CORPUS_REFINERY_SCHEMA_REVISION } from "./corpus-provider.ts";
import { seedManualRefineryRun, seedRefineryRun, seedRefinerySchema, seedRefinerySession } from "./factories/refinery.ts";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

export interface SeededCorpusRefinery {
  readonly character: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly session: Awaited<ReturnType<typeof seedRefinerySession>>;
  readonly preflight: Awaited<ReturnType<CorpusCaller["refinery"]["preflight"]>>;
  readonly score: Awaited<ReturnType<typeof seedRefineryRun>>;
  readonly rewrite: Awaited<ReturnType<typeof seedRefineryRun>>;
  readonly analyze: Awaited<ReturnType<typeof seedRefineryRun>>;
  readonly review: Awaited<ReturnType<CorpusCaller["refinery"]["decideRewrite"]>>;
  readonly iteration: Awaited<ReturnType<CorpusCaller["refinery"]["iterate"]>>;
  readonly manual: Awaited<ReturnType<typeof seedManualRefineryRun>>;
  readonly operateBack: Awaited<ReturnType<CorpusCaller["refinery"]["runStage"]>>;
  readonly dropped: Awaited<ReturnType<CorpusCaller["refinery"]["applyFields"]>>;
  readonly copy: Awaited<ReturnType<CorpusCaller["refinery"]["applyAsCopy"]>>;
  readonly applied: Awaited<ReturnType<CorpusCaller["refinery"]["applyFields"]>>;
  readonly forged: Awaited<ReturnType<CorpusCaller["refinery"]["generateSchema"]>>;
  readonly schema: Awaited<ReturnType<typeof seedRefinerySchema>>;
  readonly revisedSchema: Awaited<ReturnType<CorpusCaller["refinery"]["updateSchema"]>>;
  readonly customSession: Awaited<ReturnType<typeof seedRefinerySession>>;
  readonly customFirst: Awaited<ReturnType<typeof seedRefineryRun>>;
  readonly customSecond: Awaited<ReturnType<typeof seedRefineryRun>>;
  readonly schemaPlan: Awaited<ReturnType<CorpusCaller["refinery"]["schemaPlan"]>>;
  readonly drill: Awaited<ReturnType<CorpusCaller["refinery"]["testSchema"]>>;
  readonly sessions: Awaited<ReturnType<CorpusCaller["refinery"]["listSessions"]>>;
  readonly runs: Awaited<ReturnType<CorpusCaller["refinery"]["listRuns"]>>;
  readonly customRuns: Awaited<ReturnType<CorpusCaller["refinery"]["listRuns"]>>;
}

/** Execute real modeled/manual/custom paths without substituting a stored run, card anchor or schema version. */
export async function seedCorpusRefinery(root: ServerTestHarness): Promise<SeededCorpusRefinery> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "corpus-refinery",
      name: "Ledger keeper",
      description: "A curious keeper preserves a ledger.",
      personality: "Curious and careful.",
    }),
  });
  const session = await seedRefinerySession(root, { principal, characterId: character.id, name: "Orbital ledger refinement" });
  const preflight = await caller.refinery.preflight({ sessionId: session.id });
  const score = await seedRefineryRun(root, { principal, sessionId: session.id, stage: "score" });
  const rewrite = await seedRefineryRun(root, { principal, sessionId: session.id, stage: "rewrite" });
  const analyze = await seedRefineryRun(root, { principal, sessionId: session.id, stage: "analyze" });
  const review = await caller.refinery.decideRewrite({ sessionId: session.id, rewriteRunId: rewrite.id, decisions: [true] });
  const iteration = await caller.refinery.iterate({ sessionId: session.id, guidance: "Keep the keeper curious." });
  const manual = await seedManualRefineryRun(root, {
    principal,
    sessionId: session.id,
    fields: [{ field: "description", text: "A careful keeper records the orbital witnesses in a ledger." }],
  });
  const operateBack = await caller.refinery.runStage({ sessionId: session.id, stage: "analyze", rewriteRunId: rewrite.id });
  const dropped = await caller.refinery.applyFields({ sessionId: session.id, rewriteRunId: manual.id, accepts: [{ field: "scenario" }] });
  const copy = await caller.refinery.applyAsCopy({
    sessionId: session.id,
    rewriteRunId: rewrite.id,
    accepts: [{ field: "description" }],
    name: "Branch ledger keeper",
  });
  if (copy.character === null) {
    throw new Error("actual refinery copy refused the corpus's required branch");
  }
  const applied = await caller.refinery.applyFields({ sessionId: session.id, rewriteRunId: manual.id, accepts: [{ field: "description" }] });
  const forged = await caller.refinery.generateSchema({
    stage: "score",
    arm: "single",
    description: "Score the keeper and explain the score in a bounded note.",
  });
  if (forged.kind !== "draft") {
    throw new Error("actual refinery forge did not produce the corpus's required schema draft", { cause: forged });
  }
  const schema = await seedRefinerySchema(root, {
    principal,
    name: forged.name,
    description: "Preserve the keeper and explain its score.",
    stage: "score",
    schema: forged.schema,
  });
  const customSession = await seedRefinerySession(root, { principal, characterId: copy.character.id, name: "Custom keeper rubric" });
  await caller.refinery.updateSession({
    sessionId: customSession.id,
    patch: { stageConfig: { ...customSession.stageConfig, score: { kind: "custom", schemaId: schema.id } } },
  });
  const schemaPlan = await caller.refinery.schemaPlan({ stage: "score", schema: schema.schema });
  const drill = await caller.refinery.testSchema({ stage: "score", schema: schema.schema, characterId: copy.character.id });
  const customFirst = await seedRefineryRun(root, { principal, sessionId: customSession.id, stage: "score" });
  const revisedSchema = await caller.refinery.updateSchema({ schemaId: schema.id, patch: { name: CORPUS_REFINERY_SCHEMA_REVISION } });
  const customSecond = await seedRefineryRun(root, { principal, sessionId: customSession.id, stage: "score" });
  const sessions = await caller.refinery.listSessions();
  const runs = await caller.refinery.listRuns({ sessionId: session.id });
  const customRuns = await caller.refinery.listRuns({ sessionId: customSession.id });
  return {
    character,
    session,
    preflight,
    score,
    rewrite,
    analyze,
    review,
    iteration,
    manual,
    operateBack,
    dropped,
    copy,
    applied,
    forged,
    schema,
    revisedSchema,
    customSession,
    customFirst,
    customSecond,
    schemaPlan,
    drill,
    sessions,
    runs,
    customRuns,
  };
}
