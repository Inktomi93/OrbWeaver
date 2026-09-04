// Type-heavy Snap evidence modules expose their cross-file shapes only from contract/. File-local helper
// types stay private: exporting one "just in case" makes Knip's public API inventory lie and forces every
// cold agent to decide whether an unused name is contractual.
import { fileURLToPath } from "node:url";
import { Node, Project } from "ts-morph";
import { expect, test } from "../../../support/tool-fixtures.ts";

const EXPECTED_TYPE_EXPORTS = {
  "contract/map.ts": [
    "MapActionability",
    "MapAtlasEvidence",
    "MapChatPosition",
    "MapConfigGroupId",
    "MapContextTabId",
    "MapEntry",
    "MapInactiveReason",
    "MapModalSlotId",
    "MapNavCapabilities",
    "MapSectionId",
    "MapShellEvidence",
    "MapShellRegion",
    "MapVisibility",
    "RawMapBridgeEvidence",
    "RawMapEntry",
  ],
  "contract/react-profile.ts": [
    "RankedReactComponent",
    "ReactActivitySummary",
    "ReactCommitEvidence",
    "ReactCommitPayload",
    "ReactFiberEvidence",
    "ReactProfileLimits",
    "ReactProfilePageEvidence",
    "ReactProfileSummaryArtifact",
    "ReactRendererEvidence",
  ],
  "lib/react-profile.ts": [],
} as const;

function exportedTypeNames(relativePath: keyof typeof EXPECTED_TYPE_EXPORTS): readonly string[] {
  const path = fileURLToPath(new URL(`../../../../tooling/src/snap/${relativePath}`, import.meta.url));
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const source = project.addSourceFileAtPath(path);
  return source
    .getStatements()
    .filter((statement) => Node.isInterfaceDeclaration(statement) || Node.isTypeAliasDeclaration(statement))
    .filter((statement) => statement.isExported())
    .map((statement) => statement.getName())
    .sort();
}

test("Snap map and React profile modules export cross-file evidence shapes only from contract", () => {
  for (const [path, expected] of Object.entries(EXPECTED_TYPE_EXPORTS)) {
    expect(exportedTypeNames(path as keyof typeof EXPECTED_TYPE_EXPORTS), path).toEqual([...expected].sort());
  }
});
