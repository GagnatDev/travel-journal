import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BottomNavBar } from '../components/BottomNavBar.js';

import { TestMemoryRouter } from './TestMemoryRouter.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderNav(props: { tripId?: string; tripRole?: 'creator' | 'contributor' | 'follower' }) {
  const initialEntry = props.tripId ? `/trips/${props.tripId}/timeline` : '/trips';
  return render(
    <TestMemoryRouter initialEntries={[initialEntry]}>
      <BottomNavBar {...props} />
    </TestMemoryRouter>,
  );
}

describe('BottomNavBar', () => {
  it('renders only the Home item when no tripId is given', () => {
    renderNav({});
    expect(screen.getByText('Turer')).toBeInTheDocument();
    expect(screen.queryByText('Tidslinje')).not.toBeInTheDocument();
  });

  it('renders timeline, map, and settings items when tripId is given without addEntry', () => {
    renderNav({ tripId: 'trip-1', tripRole: 'follower' });
    expect(screen.getByText('Tidslinje')).toBeInTheDocument();
    expect(screen.getByText('Kart')).toBeInTheDocument();
    expect(screen.getByText('Innstillinger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Legg til innlegg' })).not.toBeInTheDocument();
  });

  it('renders FAB when tripId and canAddEntry (creator)', () => {
    renderNav({ tripId: 'trip-1', tripRole: 'creator' });
    expect(screen.getByRole('button', { name: 'Legg til innlegg' })).toBeInTheDocument();
  });

  it('renders FAB when tripId and canAddEntry (contributor)', () => {
    renderNav({ tripId: 'trip-1', tripRole: 'contributor' });
    expect(screen.getByRole('button', { name: 'Legg til innlegg' })).toBeInTheDocument();
  });

  it('navigates to /trips when Home is clicked', async () => {
    mockNavigate.mockClear();
    renderNav({});
    await userEvent.click(screen.getByText('Turer'));
    expect(mockNavigate).toHaveBeenCalledWith('/trips');
  });

  it('navigates to entries/new when FAB is clicked', async () => {
    mockNavigate.mockClear();
    renderNav({ tripId: 'trip-1', tripRole: 'creator' });
    await userEvent.click(screen.getByRole('button', { name: 'Legg til innlegg' }));
    expect(mockNavigate).toHaveBeenCalledWith('/trips/trip-1/entries/new');
  });

  it('nav items include svg icons', () => {
    const { container } = renderNav({ tripId: 'trip-1', tripRole: 'follower' });
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
