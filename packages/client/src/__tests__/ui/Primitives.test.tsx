import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Avatar } from '../../components/ui/Avatar.js';
import { IconBadge } from '../../components/ui/IconBadge.js';
import { PillButton } from '../../components/ui/PillButton.js';
import { SectionLabel } from '../../components/ui/SectionLabel.js';

describe('SectionLabel', () => {
  it('renders children text', () => {
    render(<SectionLabel>OUR SHARED JOURNEY</SectionLabel>);
    expect(screen.getByRole('heading', { name: 'OUR SHARED JOURNEY' })).toBeInTheDocument();
  });

  it('renders badge when provided', () => {
    render(<SectionLabel badge={<span>4 TOTAL</span>}>MEMBERS</SectionLabel>);
    expect(screen.getByText('4 TOTAL')).toBeInTheDocument();
  });

  it('does not render badge slot when badge is omitted', () => {
    const { container } = render(<SectionLabel>MEMBERS</SectionLabel>);
    // The badge wrapper span should not appear
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(0);
  });
});

describe('PillButton', () => {
  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>INVITE</PillButton>);
    await userEvent.click(screen.getByRole('button', { name: 'INVITE' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders icon when provided', () => {
    render(<PillButton icon={<svg data-testid="icon" />}>SAVE</PillButton>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('has w-full class when fullWidth is true', () => {
    render(<PillButton fullWidth>SAVE</PillButton>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('does not have w-full class when fullWidth is false', () => {
    render(<PillButton>SAVE</PillButton>);
    expect(screen.getByRole('button')).not.toHaveClass('w-full');
  });

  it('applies border style for ghost variant', () => {
    render(<PillButton variant="ghost">CANCEL</PillButton>);
    expect(screen.getByRole('button')).toHaveClass('border');
  });

  it('applies bg-accent for primary variant', () => {
    render(<PillButton variant="primary">SAVE</PillButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-accent');
  });
});

describe('Avatar', () => {
  it('shows initials (max 2 chars) when no src is provided', () => {
    render(<Avatar name="Ann Katrin" />);
    expect(screen.getByRole('img', { name: 'Ann Katrin' })).toHaveTextContent('AK');
  });

  it('shows single-word initials correctly', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByRole('img', { name: 'Alice' })).toHaveTextContent('AL');
  });

  it('renders an img element when src is provided', () => {
    render(<Avatar name="Ann" src="/photo.jpg" />);
    const img = screen.getByRole('img', { name: 'Ann' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/photo.jpg');
    expect(img).toHaveAttribute('alt', 'Ann');
  });

  it('is taller for md size than sm size', () => {
    const { rerender } = render(<Avatar name="Ann" size="sm" />);
    const smEl = screen.getByRole('img', { name: 'Ann' });
    expect(smEl).toHaveClass('w-8');

    rerender(<Avatar name="Ann" size="md" />);
    const mdEl = screen.getByRole('img', { name: 'Ann' });
    expect(mdEl).toHaveClass('w-12');
  });
});

describe('IconBadge', () => {
  it('renders children inside the badge wrapper', () => {
    render(
      <IconBadge>
        <svg data-testid="calendar-icon" />
      </IconBadge>,
    );
    expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
  });

  it('applies the sage-bg background class', () => {
    const { container } = render(
      <IconBadge>
        <svg />
      </IconBadge>,
    );
    expect(container.firstChild).toHaveClass('bg-sage-bg');
  });
});
