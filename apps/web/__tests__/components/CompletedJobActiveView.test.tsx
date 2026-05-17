import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompletedJobActiveView } from '@/components/CompletedJobActiveView';

describe('<CompletedJobActiveView>', () => {
  it('shows the credit amount when the Active was confirmed', () => {
    render(
      <CompletedJobActiveView
        viewerCredit={{ confirmed: true, amount: '25.00' }}
      />,
    );
    expect(screen.getByTestId('completed-job-active-view')).toBeInTheDocument();
    expect(screen.getByTestId('completed-credit-amount')).toHaveTextContent(
      /\$25\.00/,
    );
    expect(
      screen.getByText(/look for this credit in the chapter dues books/i),
    ).toBeInTheDocument();
  });

  it('renders the not-confirmed message when confirmed=false (Q-PLN-01 lean)', () => {
    render(
      <CompletedJobActiveView
        viewerCredit={{ confirmed: false, amount: null }}
      />,
    );
    expect(screen.getByTestId('completed-not-confirmed')).toHaveTextContent(
      /weren't confirmed/i,
    );
  });

  it('renders nothing when viewerCredit is null', () => {
    const { container } = render(
      <CompletedJobActiveView viewerCredit={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
