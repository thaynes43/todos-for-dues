import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import { TreasurerBreakdown } from '../TreasurerBreakdown';

const SAMPLE_PROPS = {
  jobDescription: 'Clean the lawn at the chapter house',
  jobId: '11111111-1111-1111-1111-111111111111',
  totalAmount: '100.00',
  lineItems: [
    { displayName: 'Alice Active', amount: '33.34' },
    { displayName: 'Bob Active', amount: '33.33' },
    { displayName: 'Carol Active', amount: '33.33' },
  ],
  timestamp: new Date('2026-05-16T12:00:00.000Z'),
};

describe('TreasurerBreakdown template', () => {
  it('matches the rendered-HTML snapshot', async () => {
    const html = await render(React.createElement(TreasurerBreakdown, SAMPLE_PROPS));
    expect(html).toMatchSnapshot();
  });

  it('contains the job description, total, line items, job ID, and timestamp (PRD-005 AC-08)', async () => {
    const html = await render(React.createElement(TreasurerBreakdown, SAMPLE_PROPS));
    expect(html).toContain(SAMPLE_PROPS.jobDescription);
    expect(html).toContain(`$${SAMPLE_PROPS.totalAmount}`);
    expect(html).toContain(SAMPLE_PROPS.jobId);
    expect(html).toContain(SAMPLE_PROPS.timestamp.toISOString());
    for (const item of SAMPLE_PROPS.lineItems) {
      expect(html).toContain(item.displayName);
      expect(html).toContain(`$${item.amount}`);
    }
  });
});
