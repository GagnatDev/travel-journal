import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppHeader } from '../components/AppHeader.js';

describe('AppHeader', () => {
  it('renders hamburger button with correct aria-label', () => {
    render(<AppHeader />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('renders the app name', () => {
    render(<AppHeader />);
    expect(screen.getByText('The Digital Keepsake')).toBeInTheDocument();
  });

  it('renders notification bell button with correct aria-label', () => {
    render(<AppHeader />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
});
