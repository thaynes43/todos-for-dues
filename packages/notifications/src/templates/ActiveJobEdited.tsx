import * as React from 'react';
import { Heading, Html, Link, Section, Text } from '@react-email/components';
import {
  Layout,
  emailButton,
  emailHeading,
  emailText,
} from './_components/Layout';

export interface ActiveJobEditedChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ActiveJobEditedProps {
  jobId: string;
  jobDescription: string;
  posterDisplayName: string;
  changes: ReadonlyArray<ActiveJobEditedChange>;
  // The state the job will be in *after* the edit (R-05: demoted to
  // awaiting_moderation). Surfaced so the Active understands the job is being
  // re-reviewed and the enrollment is paused.
  newJobState: string;
  jobUrl: string;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  return String(value);
}

export function ActiveJobEdited({
  jobDescription,
  posterDisplayName,
  changes,
  newJobState,
  jobUrl,
}: ActiveJobEditedProps): React.ReactElement {
  const reReviewing = newJobState === 'awaiting_moderation';
  return (
    <Html>
      <Layout preview={`A job you're enrolled in changed: ${jobDescription}`}>
        <Heading as="h2" style={emailHeading}>
          A job you&apos;re enrolled in changed
        </Heading>
        <Text style={emailText}>
          <strong>{posterDisplayName}</strong> updated &ldquo;{jobDescription}
          &rdquo;.
        </Text>
        {reReviewing ? (
          <Text style={emailText}>
            The changes were big enough for a Moderator re-review. Your
            enrollment stays.
          </Text>
        ) : null}

        <Section>
          <Heading
            as="h3"
            style={{ ...emailHeading, fontSize: '18px', margin: '16px 0 4px' }}
          >
            What changed
          </Heading>
          {changes.map((c) => (
            <Text key={c.field} style={emailText}>
              <strong>{c.field}:</strong> {fmt(c.before)} → {fmt(c.after)}
            </Text>
          ))}
        </Section>

        <Section style={{ marginTop: '16px' }}>
          <Link href={jobUrl} style={emailButton}>
            Open the job
          </Link>
        </Section>
      </Layout>
    </Html>
  );
}
