import type { StringLiteral } from "ts-morph";
import type { PackageFileReach } from "../../floor/code-facts/module-reach-contract.ts";

const TEST_IMPORT_DOOR_KINDS = ["relative-package", "relative-testkit", "raw-package"] as const;

interface TestImportDoorFields {
  readonly "relative-package": PackageFileReach;
  readonly "relative-testkit": { readonly door: string };
  readonly "raw-package": PackageFileReach;
}

export type TestImportDoor = {
  readonly [Kind in (typeof TEST_IMPORT_DOOR_KINDS)[number]]: { readonly kind: Kind; readonly literal: StringLiteral } & TestImportDoorFields[Kind];
}[(typeof TEST_IMPORT_DOOR_KINDS)[number]];
