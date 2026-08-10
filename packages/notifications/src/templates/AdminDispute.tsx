import * as React from 'react';
import { Heading, Html, Link, Section, Text } from '@react-email/components';
import {
  Layout,
  emailButton,
  emailColors,
  emailHeading,
  emailText,
} from './_components/Layout';

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
      <Layout preview="Dispute opened — needs an Admin">
        <Heading as="h2" style={emailHeading}>
          Dispute opened — needs an Admin
        </Heading>

        <Section>
          <Text style={emailText}>
            <strong>Job:</strong> {jobDescription}
          </Text>
          <Text style={emailText}>
            <strong>Disputed by:</strong> {disputerDisplayName} ({disputerRole})
          </Text>
          <Text style={emailText}>
            <strong>Reason:</strong> {reason}
          </Text>
          <Text style={{ ...emailText, fontSize: '13px', color: emailColors.muted }}>
            Job ID: {jobId}
          </Text>
        </Section>

        <Section style={{ marginTop: '16px' }}>
          <Link href={adminViewUrl} style={emailButton}>
            Review the dispute
          </Link>
        </Section>
      </Layout>
    </Html>
  );
}
