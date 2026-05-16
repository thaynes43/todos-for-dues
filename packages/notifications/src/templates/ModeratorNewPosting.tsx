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
  jobId,
  posterDisplayName,
  duesAmount,
  recommendedPeopleCount,
  moderationQueueUrl,
}: ModeratorNewPostingProps): React.ReactElement {
  return (
    <Html>
      <Layout preview={`New posting awaiting moderation: ${jobDescription}`}>
        <Container>
          <Heading as="h2">New posting awaiting moderation</Heading>
          <Text>
            A new job has been submitted and is waiting for a Moderator to approve or reject it.
          </Text>

          <Section>
            <Text>
              <strong>Posted by:</strong> {posterDisplayName}
            </Text>
            <Text>
              <strong>Job:</strong> {jobDescription}
            </Text>
            <Text>
              <strong>Job ID:</strong> {jobId}
            </Text>
            <Text>
              <strong>Dues amount:</strong> {`$${duesAmount}`}
            </Text>
            <Text>
              <strong>Recommended attendees:</strong> {recommendedPeopleCount}
            </Text>
          </Section>

          <Section>
            <Link href={moderationQueueUrl}>Open moderation queue →</Link>
          </Section>
        </Container>
      </Layout>
    </Html>
  );
}
