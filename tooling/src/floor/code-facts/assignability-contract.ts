import { z } from "zod";

export const typeRelationSchema = z.object({ leftToRight: z.boolean(), rightToLeft: z.boolean(), leftIsAny: z.boolean(), rightIsAny: z.boolean() }).readonly();
export type TypeRelation = z.infer<typeof typeRelationSchema>;
