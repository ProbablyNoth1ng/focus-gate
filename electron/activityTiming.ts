export interface ActivityInterval {
  start_timestamp: number
  end_timestamp: number
  elapsed_seconds: number
}

/** Uses the actual elapsed span for the timeline while retaining whole-second counters. */
export function getActivityInterval(startTimestamp: number, endTimestamp: number): ActivityInterval {
  return {
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    elapsed_seconds: Math.max(1, Math.min(10, Math.round((endTimestamp - startTimestamp) / 1000))),
  }
}
