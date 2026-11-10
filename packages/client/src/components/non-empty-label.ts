/**
 * A composite's button word: any string a caller computes, or a literal that is not empty. An empty literal draws a
 * button no screen reader can name, so it fails to compile. Each label prop takes it through its own type parameter
 * the call infers; a shared one would widen to `string` beside a computed sibling and let an empty literal through.
 *
 * @remarks A `string` passes because a copy name is often built at runtime (`${verb} ${name}`); a brand would need a
 * cast at each of those builders, and the empty literal is the mistake a typo makes.
 */
export type NonEmptyLabel<L extends string> = L & (string extends L ? unknown : "" extends L ? never : unknown);
