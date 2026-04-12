import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../context/ThemeContext.js';

function ThemeStatus() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="isDark">{isDark ? 'dark' : 'light'}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeStatus />
    </ThemeProvider>,
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to light when no stored theme and system prefers light', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    renderTheme();
    expect(screen.getByTestId('isDark').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('defaults to dark when no stored theme and system prefers dark', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    renderTheme();
    expect(screen.getByTestId('isDark').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('respects stored "dark" theme over system preference', () => {
    localStorage.setItem('theme', 'dark');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    renderTheme();
    expect(screen.getByTestId('isDark').textContent).toBe('dark');
  });

  it('respects stored "light" theme over system preference', () => {
    localStorage.setItem('theme', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    renderTheme();
    expect(screen.getByTestId('isDark').textContent).toBe('light');
  });

  it('toggleTheme adds .dark class and persists to localStorage', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    renderTheme();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(screen.getByTestId('isDark').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggleTheme removes .dark class and persists to localStorage', async () => {
    localStorage.setItem('theme', 'dark');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    renderTheme();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(screen.getByTestId('isDark').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
