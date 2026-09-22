// respell (+ --near): command orchestration for domain contract shapes matching @orb/contracts shapes.

import process from "node:process";
import type { Node, Project } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticWorkspaceOf } from "../../_shared/ts-workspace.ts";
import type { Flags, MalformedNearPairMarker, NearPairExemption, StaleNearPairMarker } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";
import { RESPELL_NEAR_PROPERTY_FLOOR } from "../lib/respell-near-analysis.ts";
import { respellNearAuditFor } from "../lib/respell-near-markers.ts";
import { malformedNearPairMarkerEvidence, nearPairExemptionEvidence, nearPairHit, staleNearPairMarkerEvidence } from "../lib/respell-near-report.ts";
import type { AssignabilityChecker } from "../lib/respell-shapes.ts";
import { assignabilityChecker, domainsWithContracts, RESPELL_PROPERTY_FLOOR, respellHitsFor } from "../lib/respell-shapes.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

function checkerProjectOf(corpus: SourceCorpus): Pick<Project, "getTypeChecker"> {
  if ("getTypeChecker" in corpus && typeof corpus.getTypeChecker === "function") {
    return corpus as Pick<Project, "getTypeChecker">;
  }
  const project = semanticWorkspaceOf(corpus)?.programs[0]?.project();
  if (project === undefined) {
    exitToolError("ast respell: semantic corpus has no runnable compiler program");
  }
  return project;
}

function declarationIsInScope(decl: Node, flags: Flags): boolean {
  return flags.in === null || hitOf(decl, "respell-near-scope").file.includes(flags.in);
}

function printNearPairExemptions(exemptions: readonly NearPairExemption[], flags: Flags): void {
  if (flags.json) {
    return;
  }
  for (const exemption of exemptions) {
    const evidence = nearPairExemptionEvidence(exemption);
    narrate(flags, `  = ${evidence.domainName} EXEMPT ${evidence.target} — ${evidence.diff} — ${evidence.reason}`);
  }
}

/** The STALE side of `@nearpair-ok:` — the marker's named target is absent even when a different sibling
 *  remains a candidate. Printed and exit-1, so target drift cannot leave a blanket exemption behind. */
function printStaleNearPairTags(staleMarkers: readonly StaleNearPairMarker[], flags: Flags): void {
  if (staleMarkers.length === 0) {
    return;
  }
  narrate(
    flags,
    `respell --near: ${staleMarkers.length} STALE \`@nearpair-ok:\` marker(s) — the named contracts declaration is no longer this shape's candidate at the current threshold. Delete the marker or name the surviving pair:`,
  );
  for (const marker of staleMarkers) {
    const evidence = staleNearPairMarkerEvidence(marker);
    narrate(flags, `  ! ${evidence.file}:${evidence.line}  [${evidence.kind}]  ${marker.domainName} STALE ${evidence.target} — ${marker.reason}`);
  }
  process.exitCode = 1;
}

function printMalformedNearPairTags(malformedMarkers: readonly MalformedNearPairMarker[], flags: Flags): void {
  if (malformedMarkers.length === 0) {
    return;
  }
  narrate(
    flags,
    `respell --near: ${malformedMarkers.length} MALFORMED \`@nearpair-ok:\` marker(s) — use \`@nearpair-ok: near-matches @orb/contracts/<domain>::<Name> <nonblank reason>\`:`,
  );
  for (const marker of malformedMarkers) {
    const evidence = malformedNearPairMarkerEvidence(marker);
    narrate(flags, `  ! ${evidence.file}:${evidence.line}  [${evidence.kind}]  ${marker.domainName} — ${marker.marker}`);
  }
  process.exitCode = 1;
}

interface RespellNearScope {
  readonly domains: readonly string[];
  readonly thresholdPct: number;
}

/** The additive near tier: classify all markers once, then emit a separate result beside exact respell. */
function cmdRespellNear(project: SourceCorpus, checker: AssignabilityChecker, scope: RespellNearScope, flags: Flags): void {
  const { domains, thresholdPct } = scope;
  const audits = domains.map((domain) => respellNearAuditFor(project, checker, domain, thresholdPct));
  const candidates = audits.flatMap((audit) => audit.candidates);
  const exemptions = audits.flatMap((audit) => audit.exemptions).filter(({ candidate }) => declarationIsInScope(candidate.domainDecl, flags));
  const staleMarkers = audits.flatMap((audit) => audit.staleMarkers).filter(({ domainDecl }) => declarationIsInScope(domainDecl, flags));
  const malformedMarkers = audits.flatMap((audit) => audit.malformedMarkers).filter(({ domainDecl }) => declarationIsInScope(domainDecl, flags));
  const exemptKeys = new Set(exemptions.map(({ candidate }) => `${declKey(candidate.domainDecl)}\0${declKey(candidate.contractsDecl)}`));
  const reportable = candidates.filter((candidate) => !exemptKeys.has(`${declKey(candidate.domainDecl)}\0${declKey(candidate.contractsDecl)}`));
  printStaleNearPairTags(staleMarkers, flags);
  printMalformedNearPairTags(malformedMarkers, flags);
  printNearPairExemptions(exemptions, flags);
  narrate(
    flags,
    `respell --near is a CANDIDATE lens — Jaccard similarity over (fieldName, semanticType) pairs at ≥${thresholdPct}%, where semantic type identity is bidirectional checker assignability in every co-located native program; floor ${RESPELL_NEAR_PROPERTY_FLOOR}+ fields on both sides, EXCLUDING every pair the exact tier already resolves. A near-twin that STARTED as a copy and drifted a field is the drift class this exists to catch; a genuinely deliberate near-pair (two shapes that happen to share most fields) is legitimate — verify before acting. Keep one deliberately with \`// @nearpair-ok: near-matches @orb/contracts/<domain>::<Name> <reason>\` on the domain declaration.${exemptions.length === 0 ? "" : ` (${exemptions.length} pair(s) exempted by a reasoned marker and printed above.)`}`,
  );
  emit(reportable.map(nearPairHit), flags, `respell --near>=${thresholdPct} ${domains.length === 1 ? domains[0] : "(all domains)"}`, {
    jsonFields: {
      exemptions: exemptions.map(nearPairExemptionEvidence),
      staleMarkers: staleMarkers.map(staleNearPairMarkerEvidence),
      malformedMarkers: malformedMarkers.map(malformedNearPairMarkerEvidence),
    },
  });
}

/** Domain `contract/` shapes structurally identical to a shape the sibling `@orb/contracts/<domain>` already
 *  exports. Optional arg selects one domain; bare selects all domains. */
export function cmdRespell(project: SourceCorpus, arg: string, flags: Flags): void {
  const domains = domainsWithContracts(project, arg);
  noteUnits("domains", domains.length);
  if (domains.length === 0) {
    exitToolError(`ast respell: no domain contract/ dir matched "${arg}" — try a domain name (chat, rpg, preset, …) or run bare for all.`);
  }
  scanCorpus(project, {
    scope: domains.flatMap((domain) => [`/packages/contracts/src/${domain}/`, `/packages/server/src/domain/${domain}/contract/`]),
    label: `path:domain-contracts(${domains.length})`,
  });
  const checker = assignabilityChecker(checkerProjectOf(project));
  const hits = domains.flatMap((domain) => respellHitsFor(project, checker, domain));
  narrate(
    flags,
    `respell is a CANDIDATE lens — structural identity is EVIDENCE of a re-spell, not proof: two shapes may agree today and be free to diverge tomorrow. Verify intent before acting, and prefer a derive when the domain shape IS the contracts shape. (${RESPELL_PROPERTY_FLOOR}+ properties, checker-resolved; a \`respell-same-name\` hit is already RED at the \`contract-derives-not-respells\` gate.)`,
  );
  emit(hits, flags, `respell ${arg === "" ? "(all domains)" : arg}`);
  if (flags.near !== null) {
    cmdRespellNear(project, checker, { domains, thresholdPct: flags.near }, flags);
  }
}
