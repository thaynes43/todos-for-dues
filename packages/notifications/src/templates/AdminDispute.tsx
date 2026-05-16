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

export interface AdminDisputeProps {
  jobDescription: string;
  jobId: string;
  disputerDisplayName: string;
  disputerRole: string;
  reason: string;
  adminViewUrl: string;
}

export function AdminDispute({
  jobDescription,
  jobId,
  disputerDisplayName,
  disputerRole,
  reason,
  adminViewUrl,
}: AdminDisputeProps): React.ReactElement {
  return (
    <Html>
      <Layout preview="Admin attention needed — dispute opened">
        <Container>
          <Heading as="h2">Dispute opened — Admin attention needed</Heading>

          <Section>
            <Text>
              <strong>Job:</strong> {jobDescription}
            </Text>
            <Text>
              <strong>Job ID:</strong> {jobId}
            </Text>
            <Text>
              <strong>Disputed by:</strong> {disputerDisplayName} ({disputerRole})
            </Text>
          </Section>

          <Section>
            <Heading as="h3">Reason</Heading>
            <Text>{reason}</Text>
          </Section>

          <Section>
            <Link href={adminViewUrl}>Open in Admin view →</Link>
          </Section>
        </Container>
      </Layout>
    </Html>
  );
}
