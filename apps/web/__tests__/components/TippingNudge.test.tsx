import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TippingNudge } from '@/components/TippingNudge';

describe('<TippingNudge>', () => {
  it('renders the static cultural nudge text', () => {
    render(<TippingNudge />);
    const node = screen.getByTestId('tipping-nudge');
    expect(node).toBeInTheDocument();
    expect(node.textContent).toMatch(/Tipping is encouraged/i);
    expect(node.textContent).toMatch(/Venmo/);
  });

  it('contains no numeric content per PRD-001 §6 Q-06', () => {
    render(<TippingNudge />);
    const text = screen.getByTestId('tipping-nudge').textContent ?? '';
    expect(text).not.toMatch(/[\d$%]/);
  });
});
