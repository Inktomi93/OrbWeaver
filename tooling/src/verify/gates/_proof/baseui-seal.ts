// The shared proof substrate for the `baseui-derives-not-respells` SPLIT: one @orb/ui seal file, one
// committed anatomy ledger, and the population-fence variants both siblings need.
//
// WHY IT IS SHARED RATHER THAN COPIED INTO EACH SIBLING. The split's whole risk is the two arms drifting
// apart — one policy judging a seal shape the other no longer recognises — and a proof set is where that
// drift becomes invisible, because each sibling's rows would still be green against its own private
// fixture. One fixture surface means the ordinary arm's `mustPass` for a HANDLER and the hard arm's
// `mustFlag` for the same handler are literally the same bytes, so the split boundary is asserted rather
// than assumed. `gates/_proof/**` is the sanctioned home for exactly this: `policy-legacy-imports` ARM B
// admits an import here by REGISTRATION (this module registers no gate), never by directory.
//
// THE LEDGER IS THE SUBJECT, NOT A CONVENIENCE. Both siblings declare `json:baseui-manifest`, and a proof
// row that omitted it would be a `[population]` tool error rather than a finding, so every helper below
// returns the ledger alongside its seal file.
import { JSON_RESOURCE_PATHS } from "../../contract/resource-json.ts";

const MANIFEST_PATH = JSON_RESOURCE_PATHS["baseui-manifest"];

/** One namespaced component: a Root with a data prop and a 2-arity handler, plus a non-Root part whose
 *  `placeholder` prop is what pins the ROOT-ONLY scope of the data arm. */
const MANIFEST_FILE: Readonly<Record<string, string>> = {
  [MANIFEST_PATH]:
    '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {' +
    '"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items", "onValueChange"], "handlers": { "onValueChange": 2 }, "inherits": [], "disposition": "exposed", "why": "" },' +
    '"Value": { "kind": "part", "symbol": "SelectValue", "from": "./value/SelectValue.js", "props": ["placeholder"], "handlers": {}, "inherits": [], "disposition": "exposed", "why": "" }' +
    "} } } }\n",
};

const SEAL_PATH = "packages/ui/src/primitives/select/probe-select.tsx";
const IMPORTS = 'import type { SelectRootProps } from "@base-ui/react/select";\nimport { Select as BaseSelect } from "@base-ui/react/select";\n';
/** The realistic seal shape: the props are SPREAD onto the Base UI Root, which is what puts them in play. */
const RENDER = "export const Seal = (p: SealProps) => <BaseSelect.Root {...p} />;\n";

export const BASE_UI_SEAL_FIXTURES = {
  imports: IMPORTS,
  render: RENDER,
  /** The ledger plus a seal whose `SealProps` body is `body`. */
  seal: (body: string): Readonly<Record<string, string>> => ({
    ...MANIFEST_FILE,
    [SEAL_PATH]: `${IMPORTS}export interface SealProps {\n${body}}\n${RENDER}`,
  }),
  /** The same seal, additionally RENDERING the non-Root `Select.Value` part.
   *
   *  This exists because the ROOT-ONLY fence is otherwise UNREACHABLE BY FIXTURE, which reads exactly like
   *  an unenforced fence and is not one (guide §4.1: a clean cut is more often an unreachable fixture than
   *  an unenforced fence). `foldPart` is only called for a part that is the Root OR whose tag the file
   *  renders, so with `<BaseSelect.Value />` absent the `Value` part is never folded at all and cutting the
   *  `isRoot` early return changes nothing. Measured: with the plain `seal` fixture the cut came back clean;
   *  with this one it reds. */
  sealRenderingValue: (body: string): Readonly<Record<string, string>> => ({
    ...MANIFEST_FILE,
    [SEAL_PATH]: `${IMPORTS}export interface SealProps {\n${body}}\nexport const Seal = (p: SealProps) => (\n  <BaseSelect.Root {...p}>\n    <BaseSelect.Value />\n  </BaseSelect.Root>\n);\n`,
  }),
  /** The ledger plus a seal file written out in full, for a row about the file's own shape. */
  file: (text: string): Readonly<Record<string, string>> => ({ ...MANIFEST_FILE, [SEAL_PATH]: text }),
  /** The ledger plus an arbitrary in-population file — a row about a file that is NOT a seal. */
  elsewhere: (path: string, text: string): Readonly<Record<string, string>> => ({ ...MANIFEST_FILE, [path]: text }),
  /** The population falsifier: the identical seal under `@client`, WITH an in-population anchor beside it.
   *  Without the anchor the run admits no path at all and comes back a `[population]` tool error rather
   *  than the clean pass the fence is supposed to produce. */
  outsidePopulation: (body: string): Readonly<Record<string, string>> => ({
    ...MANIFEST_FILE,
    "packages/ui/src/primitives/select/clean.tsx": "export const Clean = true;\n",
    "packages/client/src/features/x/surfaces/pane.tsx": `${IMPORTS}export interface SealProps {\n${body}}\n${RENDER}`,
  }),
} as const;
