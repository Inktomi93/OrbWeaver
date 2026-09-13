// Parse the observed mirror and installed declarations without acquiring either side. ResourceHost
// owns final-policy acquisition failures; the legacy caller can still expose absent version evidence.
import type { VendorCssSurface } from "../contract/resource-vendor.ts";

export interface VendorContract {
  readonly mirrorFiles: number;
  readonly documented: ReadonlySet<string>;
  readonly declared: ReadonlySet<string>;
  readonly version: string | undefined;
  readonly mirrorVersion: string | undefined;
}

type VendorContractInput = Pick<VendorCssSurface, "mirrorDocuments" | "mirrorIndexText" | "declarationFiles"> &
  Partial<Pick<VendorCssSurface, "packageVersion">>;

const CUSTOM_PROPERTY = "--[a-zA-Z_][a-zA-Z0-9_-]*";
const VENDOR_TABLE_RE = new RegExp(`^\\|\\s*\`(${CUSTOM_PROPERTY})\``, "gmu");
const VENDOR_TYPE_RE = new RegExp(`=\\s*"(${CUSTOM_PROPERTY})"`, "gu");

export function readVendorCssContract(surface: VendorContractInput): VendorContract {
  const documented = new Set<string>();
  const declared = new Set<string>();
  for (const { text } of surface.mirrorDocuments) {
    for (const match of text.matchAll(VENDOR_TABLE_RE)) {
      if (match[1] !== undefined) {
        documented.add(match[1]);
      }
    }
  }
  for (const { text } of surface.declarationFiles) {
    for (const match of text.matchAll(VENDOR_TYPE_RE)) {
      if (match[1] !== undefined) {
        declared.add(match[1]);
      }
    }
  }
  return {
    mirrorFiles: surface.mirrorDocuments.length,
    documented,
    declared,
    version: surface.packageVersion,
    mirrorVersion: /Base UI docs mirror — v(?<version>\d+\.\d+\.\d+)/u.exec(surface.mirrorIndexText)?.groups?.["version"],
  };
}
