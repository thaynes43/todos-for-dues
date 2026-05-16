import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import { AdminDispute } from '../AdminDispute';

const SAMPLE_PROPS = {
  jobDescription: 'Clean the lawn at the chapter house',
  jobId: '11111111-1111-1111-1111-111111111111',
  disputerDisplayName: 'Alice Active',
  disputerRole: 'Active',
  reason: 'Never received payment.',
  adminViewUrl: 'http://localhost:3000/admin/jobs/11111111-1111-1111-1111-111111111111',
};

describe('AdminDispute template', () => {
  it('matches the rendered-HTML snapshot', async () => {
    const html = await render(React.createElement(AdminDispute, SAMPLE_PROPS));
    expect(html).toMatchSnapshot();
  });

  it('contains job description, reason, disputer + role, job ID, and the admin drill-in link (PRD-006 AC-07)', async () => {
    const html = await render(React.createElement(AdminDispute, SAMPLE_PROPS));
    expect(html).toContain(SAMPLE_PROPS.jobDescription);
    expect(html).toContain(SAMPLE_PROPS.reason);
    expect(html).toContain(SAMPLE_PROPS.disputerDisplayName);
    expect(html).toContain(SAMPLE_PROPS.disputerRole);
    expect(html).toContain(SAMPLE_PROPS.jobId);
    expect(html).toContain(SAMPLE_PROPS.adminViewUrl);
  });
});
