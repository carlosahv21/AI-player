/** Envelope schema version. Bump when the batch shape changes. */
export const SCHEMA_VERSION = 1;

export interface AnalyticsEvent {
  event: string;
  /** Client epoch ms. */
  ts: number;
  sessionId: string;
  /** WP user id when logged in; never a name or an email. */
  userId: number | null;
  videoId: number;
  playerVersion: string;
  /** currentTime when the event happened. */
  position: number;
  payload: Record<string, unknown>;
}

export interface EventBatch {
  v: number;
  events: AnalyticsEvent[];
}

export interface AnalyticsConfig {
  /** Where batches are POSTed. The player never knows who serves it. */
  eventsUrl: string;
  sessionId: string;
  userId: number | null;
  playerVersion: string;
}
