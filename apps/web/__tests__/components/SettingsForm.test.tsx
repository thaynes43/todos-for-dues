import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mutate = vi.fn<
  (
    input: { key: string; value: unknown },
    opts?: {
      onSuccess?: () => void;
      onError?: (err: { message: string }) => void;
    },
  ) => void
>();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    settings: {
      set: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { SettingsForm } from '@/components/SettingsForm';

beforeEach(() => {
  mutate.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const INITIAL = [
  { key: 'admin_recipient_email' as const, value: 'admins@chapter.test' },
  { key: 'treasurer_recipient_email' as const, value: 'treasurer@chapter.test' },
  { key: 'moderators_recipient_email' as const, value: 'mods@chapter.test' },
  { key: 'chapter_timezone' as const, value: 'America/New_York' },
  { key: 'chapter_display_name' as const, value: 'Test Chapter' },
];

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('<SettingsForm>', () => {
  it('renders one input per MVP key with its initial value', () => {
    render(<SettingsForm initial={INITIAL} />);
    for (const row of INITIAL) {
      const input = screen.getByTestId(`settings-input-${row.key}`) as HTMLInputElement;
      expect(input.value).toBe(row.value);
    }
  });

  it('calls settings.set after a valid blur (debounced) with the trimmed value', async () => {
    render(<SettingsForm initial={INITIAL} />);
    const input = screen.getByTestId(
      'settings-input-treasurer_recipient_email',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new-treasurer@chapter.test' } });
    fireEvent.blur(input);
    expect(mutate).not.toHaveBeenCalled();
    advance(250);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      key: 'treasurer_recipient_email',
      value: 'new-treasurer@chapter.test',
    });
  });

  it('shows an inline error and does NOT call the mutation on invalid email', () => {
    render(<SettingsForm initial={INITIAL} />);
    const input = screen.getByTestId(
      'settings-input-admin_recipient_email',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.blur(input);
    advance(250);
    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('settings-error-admin_recipient_email'),
    ).toBeInTheDocument();
  });

  it('cancels a pending blur-save if the field is re-focused before the debounce fires', () => {
    render(<SettingsForm initial={INITIAL} />);
    const input = screen.getByTestId(
      'settings-input-chapter_display_name',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Updated chapter' } });
    fireEvent.blur(input);
    fireEvent.focus(input);
    advance(250);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows a Saved. toast once the mutation succeeds', () => {
    mutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.();
    });
    render(<SettingsForm initial={INITIAL} />);
    const input = screen.getByTestId(
      'settings-input-chapter_display_name',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed chapter' } });
    fireEvent.blur(input);
    advance(250);
    expect(
      screen.getByTestId('settings-saved-chapter_display_name'),
    ).toBeInTheDocument();
  });
});
