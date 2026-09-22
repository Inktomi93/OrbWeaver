import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags } from "../contract/types.ts";
import { emit, narrate } from "../lib/emit.ts";
import { noteUnits, scanCorpus } from "../lib/ledger.ts";
import { collectRegistryCandidates, registryCandidateFiles } from "./registry-candidates.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast registry-candidates");

const CANDIDATE_CLASS_COUNT = 4;

export function cmdRegistryCandidates(project: SourceCorpus, arg: string, flags: Flags): void {
  const files = registryCandidateFiles(project);
  scanCorpus(project, { scope: files.map((file) => file.getFilePath()), label: "path:production-source" });
  const all = collectRegistryCandidates(project);
  const hits = arg === "" ? all : all.filter((hit) => hit.file.includes(arg) || hit.text.includes(arg));
  noteUnits("candidate-classes", CANDIDATE_CLASS_COUNT);
  narrate(
    flags,
    `registry-candidates is an INFORMATIONAL lens: every hit needs human triage. Classes: contribution-without-door, value-side-literal-set, shared-namespace-mutation, drifted-twins. Scanned ${files.length} production source files.`,
  );
  emit(hits, flags, `registry-candidates${arg === "" ? "" : ` ${arg}`}`);
}
