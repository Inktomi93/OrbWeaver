// The composition read: skeletons, section structure, read shape, feedback shape, form shape and the variant report, in one pass over the sources.
import type { DeclaredVariants, FileFacts, Source, VariantReport } from "../eslint/index.ts";
import { variantReport } from "../eslint/index.ts";
import type { Cohort } from "./compare.ts";
import type { FeedbackScan } from "./feedback.ts";
import { buildFeedbackCohort } from "./feedback.ts";
import type { FormScan } from "./forms.ts";
import { buildFormCohort, formFactories } from "./forms.ts";
import type { ReadScan } from "./reads.ts";
import { buildReadCohort } from "./reads.ts";
import type { SkeletonCohort } from "./skeleton.ts";
import { buildSkeletons } from "./skeleton.ts";
import { buildStructureCohort } from "./structure.ts";

export interface Composition {
  readonly skeletons: readonly SkeletonCohort[];
  readonly variants: VariantReport;
  readonly scans: { readonly reads: ReadScan; readonly feedback: FeedbackScan; readonly forms: FormScan; readonly skeletonFiles: number };
}

export function analyseComposition(
  sources: readonly Source[],
  files: readonly FileFacts[],
  declared: DeclaredVariants,
): { readonly cohorts: readonly Cohort[]; readonly composition: Composition } {
  const reads = buildReadCohort(sources);
  const feedback = buildFeedbackCohort(sources);
  const forms = buildFormCohort(files, formFactories(sources));
  const skeletons = buildSkeletons(files);
  return {
    cohorts: [buildStructureCohort(files), reads.cohort, feedback.cohort, forms.cohort],
    composition: {
      skeletons,
      variants: variantReport(files, declared),
      scans: {
        reads: reads.scan,
        feedback: feedback.scan,
        forms: forms.scan,
        skeletonFiles: skeletons.reduce((sum, cohort) => sum + cohort.members.length, 0),
      },
    },
  };
}
