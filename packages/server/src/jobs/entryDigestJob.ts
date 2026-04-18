import cron, { ScheduledTask } from 'node-cron';

import { logger } from '../logger.js';
import { runDailyEntryDigest } from '../services/digest.service.js';

/**
 * Fire the daily new-entry digest at 20:00 Europe/Oslo. We use node-cron in-process
 * for operational simplicity (no separate worker, no extra infra). If the
 * server restarts during the run, missed runs are simply skipped for that day.
 *
 * Intentionally not started from `createApp` so unit/e2e tests keep a quiet
 * process; `index.ts` is the single starter.
 */
export const DIGEST_CRON_EXPRESSION = '0 20 * * *';
export const DIGEST_CRON_TIMEZONE = 'Europe/Oslo';

let scheduled: ScheduledTask | undefined;

export function startDailyEntryDigestJob(): ScheduledTask {
  if (scheduled) return scheduled;

  scheduled = cron.schedule(
    DIGEST_CRON_EXPRESSION,
    () => {
      runDailyEntryDigest().catch((err: unknown) => {
        logger.error({ err }, 'Daily entry digest run failed');
      });
    },
    { timezone: DIGEST_CRON_TIMEZONE },
  );

  logger.info(
    { cron: DIGEST_CRON_EXPRESSION, tz: DIGEST_CRON_TIMEZONE },
    'Daily entry digest job scheduled',
  );
  return scheduled;
}

export function stopDailyEntryDigestJob(): void {
  scheduled?.stop();
  scheduled = undefined;
}
