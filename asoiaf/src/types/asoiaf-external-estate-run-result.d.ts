import type {
  CollectorAttemptRecord,
  CollectorGapRecord,
  CollectorObservationRecord,
} from "../../tools/lib/asoiaf-external-estate.js";

declare module "../../tools/lib/asoiaf-external-estate.js" {
  export interface CollectorRunResult {
    sourceId: string;
    sourceRecordId: string | null;
    outcome: CollectorAttemptRecord["outcome"];
    requestCount: number;
    cacheHit: boolean;
    observation: CollectorObservationRecord | null;
    gap: CollectorGapRecord | null;
    attempt: CollectorAttemptRecord;
  }
}

export {};
