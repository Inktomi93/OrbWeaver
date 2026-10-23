// A read model and an object type alias keep their optional seams; only deps interfaces change.
export interface MacroEnvironment {
  random?: (() => number) | undefined;
}

export type ImageryDeps = {
  readonly idSource?: IdSource;
};

export interface SearchDeps {
  readonly scheduleTimeout: ScheduleOp;
  readonly embedSpace?: string;
}
