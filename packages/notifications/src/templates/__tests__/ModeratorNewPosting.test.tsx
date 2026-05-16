import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import { ModeratorNewPosting } from '../ModeratorNewPosting';

const SAMPLE_PROPS = {
  jobDescription: 'Clean the lawn at the chapter house',
  jobId: '11111111-1111-1111-1111-111111111111',
  posterDisplayName: 'Alumni Adam',
  duesAmount: '50.00',
  recommendedPeopleCount: 3,
  moderationQueueUrl: 'http://localhost:3000/moderation-queue',
};

describe('ModeratorNewPosting template', () => {
  it('matches the rendered-HTML snapshot', async () => {
    const html = await render(React.createElement(ModeratorNewPosting, SAMPLE_PROPS));
    expect(html).toMatchSnapshot();
  });

  it('contains job description, dues, recommended count, poster, and the queue link (PRD-002 R-12)', async () => {
    const html = await render(React.createElement(ModeratorNewPosting, SAMPLE_PROPS));
    expect(html).toContain(SAMPLE_PROPS.jobDescription);
    expect(html).toContain(`$${SAMPLE_PROPS.duesAmount}`);
    expect(html).toContain(String(SAMPLE_PROPS.recommendedPeopleCount));
    expect(html).toContain(SAMPLE_PROPS.posterDisplayName);
    expect(html).toContain(SAMPLE_PROPS.moderationQueueUrl);
  });
});
