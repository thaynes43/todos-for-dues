import * as React from 'react';
import {
  Column,
  Heading,
  Hr,
  Html,
  Row,
  Section,
  Text,
} from '@react-email/components';
import {
  Layout,
  emailColors,
  emailHeading,
  emailText,
} from './_components/Layout';

export interface TreasurerBreakdownProps {
  jobDescription: string;
  jobId: string;
  totalAmount: string;
  lineItems: Array<{ displayName: string; amount: string }>;
  timestamp: Date;
}

export function TreasurerBreakdown({
  jobDescription,
  jobId,
  totalAmount,
  lineItems,
  timestamp,
}: TreasurerBreakdownProps): React.ReactElement {
  return (
    <Html>
      <Layout preview={`Payment sent — credit ${lineItems.length} Active(s)`}>
        <Heading as="h2" style={emailHeading}>
          Payment sent — credit the books
        </Heading>
        <Text style={emailText}>
          The posting Alumni sent payment for this job. Credit each Active
          below.
        </Text>

        <Section>
          <Text style={emailText}>
            <strong>Job:</strong> {jobDescription}
          </Text>
          <Text style={emailText}>
            <strong>Total received:</strong> {`$${totalAmount}`}
          </Text>
          <Text style={{ ...emailText, fontSize: '13px', color: emailColors.muted }}>
            Job ID: {jobId} · {timestamp.toISOString()}
          </Text>
        </Section>

        <Hr style={{ borderColor: emailColors.border }} />

        <Heading
          as="h3"
          style={{ ...emailHeading, fontSize: '18px', margin: '16px 0 4px' }}
        >
          Credit each Active by
        </Heading>
        <Section>
          {lineItems.map((item) => (
            <Row key={`${item.displayName}-${item.amount}`}>
              <Column style={emailText}>{item.displayName}</Column>
              <Column align="right" style={emailText}>{`$${item.amount}`}</Column>
            </Row>
          ))}
          <Hr style={{ borderColor: emailColors.border }} />
          <Row>
            <Column style={emailText}>
              <strong>Total</strong>
            </Column>
            <Column align="right" style={emailText}>
              <strong>{`$${totalAmount}`}</strong>
            </Column>
          </Row>
        </Section>

        <Text style={emailText}>
          Questions go to the posting Alumni or a chapter Admin.
        </Text>
      </Layout>
    </Html>
  );
}
