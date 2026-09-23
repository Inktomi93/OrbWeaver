// Parse the installed declarations without acquiring them. ResourceHost owns final-policy acquisition
// failures. No committed mirror side any more (#10): a measured diff proved the mirror's documented
// custom-property set was identical to this reader's declared set, so `documented` is retired and every
// former `vendor.documented` call site reads `vendor.declared` instead.
import type { VendorCssSurface } from "../contract/resource-vendor.ts";

export interface VendorContract {
  readonly declared: ReadonlySet<string>;
  readonly version: string | undefined;
}

type VendorContractInput = Pick<VendorCssSurface, "declarationFiles"> & Partial<Pick<VendorCssSurface, "packageVersion">>;

const CUSTOM_PROPERTY = "--[a-zA-Z_][a-zA-Z0-9_-]*";
const VENDOR_TYPE_RE = new RegExp(`=\\s*"(${CUSTOM_PROPERTY})"`, "gu");

export function readVendorCssContract(surface: VendorContractInput): VendorContract {
  const declared = new Set<string>();
  for (const { text } of surface.declarationFiles) {
    for (const match of text.matchAll(VENDOR_TYPE_RE)) {
      if (match[1] !== undefined) {
        declared.add(match[1]);
      }
    }
  }
  return { declared, version: surface.packageVersion };
}
