import * as React from 'react';
import {
  Container,
  Heading,
  Html,
  Link,
  Section,
  Text,
} from '@react-email/components';
import { Layout } from './_components/Layout';

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
  jobId,
  jobDescription,
  posterDisplayName,
  changes,
  newJobState,
  jobUrl,
}: ActiveJobEditedProps): React.ReactElement {
  const reReviewing = newJobState === 'awaiting_moderation';
  return (
    <Html>
      <Layout
        preview={`A job you're enrolled in was edited: ${jobDescription}`}
      >
        <Container>
          <Heading as="h2">A job you&apos;re enrolled in was edited</Heading>
          <Text>
            <strong>{posterDisplayName}</strong> updated the job &ldquo;{jobDescription}
            &rdquo;. The changes are summarized below.
          </Text>
          {reReviewing ? (
            <Text>
              Because the changes were material, this job has been sent back for
              moderator re-review. Your enrollment is preserved.
            </Text>
          ) : null}

          <Section>
            <Heading as="h3">What changed</Heading>
            {changes.map((c) => (
              <Text key={c.field}>
                <strong>{c.field}:</strong> {fmt(c.before)} → {fmt(c.after)}
              </Text>
            ))}
          </Section>

          <Section>
            <Text>
              <strong>Job ID:</strong> {jobId}
            </Text>
            <Link href={jobUrl}>Open the job →</Link>
          </Section>
        </Container>
      </Layout>
    </Html>
  );
}
