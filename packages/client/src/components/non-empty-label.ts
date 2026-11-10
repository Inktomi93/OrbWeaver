/**
 * A composite's button word: any string a caller computes, or a literal that is not empty. An empty literal draws a
 * button no screen reader can name, so it fails to compile. A label prop takes it through a type parameter the call
 * infers, and every label prop of one composite shares that parameter, so one empty literal among them refuses the call.
 *
 * @remarks A `string` passes because a copy name is often built at runtime (`${verb} ${name}`); a brand would need a
 * cast at each of those builders, and the empty literal is the mistake a typo makes.
 */
export type NonEmptyLabel<L extends string> = L & (string extends L ? unknown : "" extends L ? never : unknown);
