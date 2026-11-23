// A variant prop rides a carrier: `<Track of={Stack} gap="row" />` types its own props as the primitive's, so the
// value it writes fills the primitive's prop and selects the axis that prop feeds.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, JSX_NAMESPACE, labelsIn, tailwindVariants } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/stack.tsx`;

const STACK = [
  JSX_NAMESPACE,
  'import { tv } from "tailwind-variants";',
  'const stack = tv({ variants: { gap: { row: "r", field: "f", spare: "s" } } });',
  'export interface StackProps { readonly gap?: "row" | "field" | "spare"; readonly className?: string }',
  "export const Stack = ({ gap }: StackProps): JSX.Element => <div className={stack({ gap })} />;",
  "type Component<P> = (props: P) => JSX.Element;",
  "export type TrackProps<P extends { readonly className?: string }> = P & { readonly of: Component<P>; readonly track: string };",
  "export function Track<P extends { readonly className?: string }>(props: TrackProps<P>): JSX.Element;",
  "export function Track({ of: Primitive, track, ...props }: TrackProps<{ readonly className?: never }>): JSX.Element {",
  "  return <Primitive {...props} data-track={track} />;",
  "}",
];

test("a value a carrier writes for its primitive selects the primitive's axis", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      ...tailwindVariants(),
      [FILE]: [...STACK, 'export const page = (): JSX.Element => <><Stack gap="field" /><Track of={Stack} track="chat" gap="row" /></>;'].join("\n"),
    },
    { jsx: true },
  );
  expect(labelsIn(scan, "variant-value-unused", FILE)).toEqual(["gap = spare"]);
});
