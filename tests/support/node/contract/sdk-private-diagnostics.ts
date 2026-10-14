import { z } from "zod";

export const SDK_PRIVATE_DIAGNOSTIC_SINKS = ["sdk-file", "generic-file", "generic-stderr"] as const;

export const sdkPrivateDiagnosticInputSchema = z.object({
  resultFile: z.string().min(1),
  tokens: z.array(z.string()).min(1),
  prompts: z.array(z.string()).min(1),
});

export const sdkPrivateDiagnosticResultSchema = z.object({
  errors: z.array(z.string()),
  appLogs: z.array(z.string()),
  exitCodes: z.array(z.number().nullable()),
  signalCodes: z.array(z.string().nullable()),
  nativeChildren: z.number(),
});

export type SdkPrivateDiagnosticInput = z.infer<typeof sdkPrivateDiagnosticInputSchema>;
export type SdkPrivateDiagnosticResult = z.infer<typeof sdkPrivateDiagnosticResultSchema>;
