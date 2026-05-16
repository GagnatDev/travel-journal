import { useQuery } from '@tanstack/react-query';

import { BUILD_ID, fetchDeployedBuildId } from './appBuildId.js';

const DEPLOYMENT_VERSION_QUERY_KEY = ['deployment-version'] as const;

/** How often to re-check while the notifications panel stays open. */
const POLL_MS = 60_000;

/**
 * When the notifications panel is open, polls `/version.json` and reports
 * whether the live deployment is newer than this tab's bundle (PWA-friendly).
 */
export function useDeploymentUpdateNotice(isPanelOpen: boolean): {
  hasNewDeployment: boolean;
  isChecking: boolean;
} {
  const query = useQuery({
    queryKey: DEPLOYMENT_VERSION_QUERY_KEY,
    queryFn: ({ signal }) => fetchDeployedBuildId(signal),
    enabled: isPanelOpen && BUILD_ID.length > 0,
    staleTime: 0,
    refetchInterval: isPanelOpen && BUILD_ID.length > 0 ? POLL_MS : false,
    refetchOnWindowFocus: isPanelOpen,
  });

  const deployed = query.data;
  const hasNewDeployment =
    deployed != null && deployed.length > 0 && deployed !== BUILD_ID;

  return {
    hasNewDeployment,
    isChecking: query.isFetching && deployed === undefined,
  };
}
