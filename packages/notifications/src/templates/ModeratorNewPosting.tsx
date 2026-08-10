import * as React from 'react';
import { Heading, Html, Link, Section, Text } from '@react-email/components';
import {
  Layout,
  emailButton,
  emailHeading,
  emailText,
} from './_components/Layout';

export interface ModeratorNewPostingProps {
  jobDescription: string;
  jobId: string;
  posterDisplayName: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  moderationQueueUrl: string;
}

export function ModeratorNewPosting({
  jobDescription,
  posterDisplayName,
  duesAmount,
  recommendedPeopleCount,
  moderationQueueUrl,
}: ModeratorNewPostingProps): React.ReactElement {
  return (
    <Html>
      <Layout preview={`New posting to review: ${jobDescription}`}>
        <Heading as="h2" style={emailHeading}>
          New posting to review
        </Heading>
        <Text style={emailText}>Waiting on a Moderator&apos;s call.</Text>

        <Section>
          <Text style={emailText}>
            <strong>Job:</strong> {jobDescription}
          </Text>
          <Text style={emailText}>
            <strong>Posted by:</strong> {posterDisplayName}
          </Text>
          <Text style={emailText}>
            <strong>Dues:</strong> {`$${duesAmount}`} ·{' '}
            <strong>Recommended:</strong> {recommendedPeopleCount}{' '}
            {recommendedPeopleCount === 1 ? 'person' : 'people'}
          </Text>
        </Section>

        <Section style={{ marginTop: '16px' }}>
          <Link href={moderationQueueUrl} style={emailButton}>
            Open the moderation queue
          </Link>
        </Section>
      </Layout>
    </Html>
  );
}
