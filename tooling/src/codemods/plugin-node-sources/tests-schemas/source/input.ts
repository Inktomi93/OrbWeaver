const keys = z.object({kind:z.literal("keyValue"), rows:arr.optional(), rowsFrom:binding.optional()}).strip();
