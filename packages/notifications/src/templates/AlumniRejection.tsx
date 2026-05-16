import * as React from 'react';
import {
  Container,
  Heading,
  Html,
  Section,
  Text,
} from '@react-email/components';
import { Layout } from './_components/Layout';

export interface AlumniRejectionProps {
  jobDescription: string;
  reason: string;
}

export function AlumniRejection({
  jobDescription,
  reason,
}: AlumniRejectionProps): React.ReactElement {
  return (
    <Html>
      <Layout preview="Your posting was not approved">
        <Container>
          <Heading as="h2">Your posting was not approved</Heading>
          <Text>
            A Moderator reviewed your posting and decided not to approve it. The reason they gave is
            below; you are welcome to revise and re-submit.
          </Text>

          <Section>
            <Text>
              <strong>Job:</strong> {jobDescription}
            </Text>
          </Section>

          <Section>
            <Heading as="h3">Reason</Heading>
            <Text>{reason}</Text>
          </Section>
        </Container>
      </Layout>
    </Html>
  );
}
