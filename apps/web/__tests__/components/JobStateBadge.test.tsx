import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JOB_STATES } from '@app/db/schema';
import { JobStateBadge } from '@/components/JobStateBadge';
import { stateDisplayName } from '@/lib/formatters';

describe('<JobStateBadge>', () => {
  for (const state of JOB_STATES) {
    it(`renders the display name for ${state}`, () => {
      render(<JobStateBadge state={state} />);
      expect(screen.getByTestId('job-state-badge')).toHaveTextContent(
        stateDisplayName(state),
      );
    });
  }
});
