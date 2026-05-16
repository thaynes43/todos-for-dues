import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import { AlumniRejection } from '../AlumniRejection';

const SAMPLE_PROPS = {
  jobDescription: 'Clean the lawn at the chapter house',
  reason: 'Duplicate posting — already approved earlier today.',
};

describe('AlumniRejection template', () => {
  it('matches the rendered-HTML snapshot', async () => {
    const html = await render(React.createElement(AlumniRejection, SAMPLE_PROPS));
    expect(html).toMatchSnapshot();
  });

  it('contains job description and rejection reason', async () => {
    const html = await render(React.createElement(AlumniRejection, SAMPLE_PROPS));
    expect(html).toContain(SAMPLE_PROPS.jobDescription);
    expect(html).toContain(SAMPLE_PROPS.reason);
  });
});
