import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToggleSwitch } from '../../components/ui/ToggleSwitch.js';

describe('ToggleSwitch', () => {
  it('calls onChange with inverted value when clicked', async () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch id="test-toggle" checked={false} onChange={onChange} label="Enable feature" />,
    );
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('aria-checked reflects the checked prop when true', () => {
    render(
      <ToggleSwitch id="test-toggle" checked={true} onChange={vi.fn()} label="Enable feature" />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('aria-checked reflects the checked prop when false', () => {
    render(
      <ToggleSwitch id="test-toggle" checked={false} onChange={vi.fn()} label="Enable feature" />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the label text', () => {
    render(
      <ToggleSwitch id="test-toggle" checked={false} onChange={vi.fn()} label="Allow invites" />,
    );
    expect(screen.getByText('Allow invites')).toBeInTheDocument();
  });

  it('label is associated with the switch via htmlFor', () => {
    const { container } = render(
      <ToggleSwitch id="my-toggle" checked={false} onChange={vi.fn()} label="Toggle me" />,
    );
    const label = container.querySelector('label[for="my-toggle"]');
    expect(label).toBeInTheDocument();
  });
});
