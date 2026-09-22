// Target-specific exemption marker parsing and audit for `ast respell --near`.

import type { Node } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { MalformedNearPairMarker, NearPairAudit, NearPairCandidate, NearPairExemption, StaleNearPairMarker } from "../contract/types.ts";
import { declKey } from "./keys.ts";
import { commentHost } from "./public-markers.ts";
import { respellNearCandidatesFor } from "./respell-near-analysis.ts";
import type { AssignabilityChecker } from "./respell-shapes.ts";
import { shapesUnder } from "./respell-shapes.ts";

const NEARPAIR_TAG = "@nearpair-ok:";
const NEARPAIR_OK_RE =
  /^@nearpair-ok:\s*near-matches\s+(?<quote>`?)@orb\/contracts\/(?<domain>[a-z0-9-]+)::(?<name>[A-Za-z_$][\w$]*)\k<quote>\s+(?<reason>\S(?:.*\S)?)$/u;

interface NearPairMarker {
  readonly targetDomain: string;
  readonly targetName: string;
  readonly reason: string;
}

interface NearPairMarkers {
  readonly valid: readonly NearPairMarker[];
  readonly malformed: readonly string[];
}

function markerClaimsOf(comment: string): string[] {
  const claims: string[] = [];
  for (const line of comment.split(/\r?\n/u)) {
    let from = 0;
    while (from < line.length) {
      const tagStart = line.indexOf(NEARPAIR_TAG, from);
      if (tagStart < 0) {
        break;
      }
      const nextTag = line.indexOf(NEARPAIR_TAG, tagStart + NEARPAIR_TAG.length);
      claims.push(
        line
          .slice(tagStart, nextTag < 0 ? undefined : nextTag)
          .replace(/\*\/\s*$/u, "")
          .trim(),
      );
      from = nextTag < 0 ? line.length : nextTag;
    }
  }
  return claims;
}

function nearPairMarkersOf(decl: Node): NearPairMarkers {
  const valid: NearPairMarker[] = [];
  const malformed: string[] = [];
  for (const range of commentHost(decl).getLeadingCommentRanges()) {
    for (const claim of markerClaimsOf(range.getText())) {
      const match = NEARPAIR_OK_RE.exec(claim);
      const targetDomain = match?.groups?.["domain"];
      const targetName = match?.groups?.["name"];
      const reason = match?.groups?.["reason"]?.trim();
      if (targetDomain === undefined || targetName === undefined || reason === undefined || reason === "") {
        malformed.push(claim);
      } else {
        valid.push({ targetDomain, targetName, reason });
      }
    }
  }
  return { valid, malformed };
}

function pairMatchesMarker(candidate: NearPairCandidate, marker: NearPairMarker): boolean {
  return candidate.domain === marker.targetDomain && candidate.contractsName === marker.targetName;
}

/** One domain's single classified result. Candidate enumeration happens once; exemption and staleness both
 *  consume that result, keyed by the domain declaration plus the named contracts declaration identity. */
export function respellNearAuditFor(project: SourceCorpus, checker: AssignabilityChecker, domain: string, thresholdPct: number): NearPairAudit {
  const candidates = respellNearCandidatesFor(project, checker, domain, thresholdPct);
  const exemptions: NearPairExemption[] = [];
  const staleMarkers: StaleNearPairMarker[] = [];
  const malformedMarkers: MalformedNearPairMarker[] = [];
  for (const shape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    const shapeCandidates = candidates.filter((candidate) => declKey(candidate.domainDecl) === declKey(shape.decl));
    const markers = nearPairMarkersOf(shape.decl);
    malformedMarkers.push(...markers.malformed.map((marker) => ({ domainName: shape.name, domainDecl: shape.decl, marker })));
    for (const marker of markers.valid) {
      const candidate = shapeCandidates.find((entry) => pairMatchesMarker(entry, marker));
      if (candidate === undefined) {
        staleMarkers.push({ domainName: shape.name, domainDecl: shape.decl, ...marker });
      } else {
        exemptions.push({ candidate, reason: marker.reason });
      }
    }
  }
  return { candidates, exemptions, staleMarkers, malformedMarkers };
}
