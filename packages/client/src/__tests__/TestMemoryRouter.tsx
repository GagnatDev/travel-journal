import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

type Props = ComponentProps<typeof MemoryRouter>;

/** MemoryRouter wrapper so tests share one router setup. */
export function TestMemoryRouter(props: Props) {
  return <MemoryRouter {...props} />;
}
