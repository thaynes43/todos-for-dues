import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import { ActiveJobEdited } from '../ActiveJobEdited';

const SAMPLE_PROPS = {
  jobId: '11111111-1111-1111-1111-111111111111',
  jobDescription: 'Clean the lawn at the chapter house',
  posterDisplayName: 'Alumni Adam',
  changes: [
    { field: 'duesAmount', before: 50, after: 75 },
    { field: 'location', before: 'unknown', after: 'Chapter house' },
  ],
  newJobState: 'awaiting_moderation',
  jobUrl: 'http://localhost:3000/jobs/11111111-1111-1111-1111-111111111111',
};

describe('ActiveJobEdited template', () => {
  it('contains job description, poster, each changed field, and the job link', async () => {
    const html = await render(React.createElement(ActiveJobEdited, SAMPLE_PROPS));
    expect(html).toContain(SAMPLE_PROPS.jobDescription);
    expect(html).toContain(SAMPLE_PROPS.posterDisplayName);
    expect(html).toContain('duesAmount');
    expect(html).toContain('50');
    expect(html).toContain('75');
    expect(html).toContain('location');
    expect(html).toContain('Chapter house');
    expect(html).toContain(SAMPLE_PROPS.jobUrl);
  });

  it('mentions re-review when newJobState is awaiting_moderation', async () => {
    const html = await render(
      React.createElement(ActiveJobEdited, {
        ...SAMPLE_PROPS,
        newJobState: 'awaiting_moderation',
      }),
    );
    expect(html.toLowerCase()).toContain('re-review');
  });

  it('omits the re-review note when the state did not change', async () => {
    const html = await render(
      React.createElement(ActiveJobEdited, {
        ...SAMPLE_PROPS,
        newJobState: 'enrollment_open',
      }),
    );
    expect(html.toLowerCase()).not.toContain('re-review');
  });
});
