import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { routerFutureV7 } from '../reactRouterFuture.js';

type Props = Omit<ComponentProps<typeof MemoryRouter>, 'future'>;

/** MemoryRouter with React Router v7 future flags applied for tests. */
export function TestMemoryRouter(props: Props) {
  return <MemoryRouter {...props} future={routerFutureV7} />;
}
