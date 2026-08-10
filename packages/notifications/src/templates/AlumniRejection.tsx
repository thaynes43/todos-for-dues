import * as React from 'react';
import { Heading, Html, Section, Text } from '@react-email/components';
import { Layout, emailHeading, emailText } from './_components/Layout';

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
        <Heading as="h2" style={emailHeading}>
          Your posting was not approved
        </Heading>
        <Text style={emailText}>
          A Moderator passed on it — the reason is below. Revise and re-submit
          any time.
        </Text>

        <Section>
          <Text style={emailText}>
            <strong>Job:</strong> {jobDescription}
          </Text>
          <Text style={emailText}>
            <strong>Reason:</strong> {reason}
          </Text>
        </Section>
      </Layout>
    </Html>
  );
}
