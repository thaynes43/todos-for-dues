import * as React from 'react';
import {
  Column,
  Container,
  Heading,
  Hr,
  Html,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { Layout } from './_components/Layout';

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
      <Layout preview={`Payment-sent — credit ${lineItems.length} Active(s)`}>
        <Container>
          <Heading as="h2">Payment received notification</Heading>
          <Text>
            The Alumni has marked the following job as payment-sent. Please credit each Active&apos;s
            dues balance in the chapter books.
          </Text>

          <Section>
            <Text>
              <strong>Job:</strong> {jobDescription}
            </Text>
            <Text>
              <strong>Job ID:</strong> {jobId}
            </Text>
            <Text>
              <strong>Total received:</strong> {`$${totalAmount}`}
            </Text>
            <Text>
              <strong>Timestamp:</strong> {timestamp.toISOString()}
            </Text>
          </Section>

          <Hr />

          <Heading as="h3">Credit each Active by</Heading>
          <Section>
            {lineItems.map((item) => (
              <Row key={`${item.displayName}-${item.amount}`}>
                <Column>{item.displayName}</Column>
                <Column align="right">{`$${item.amount}`}</Column>
              </Row>
            ))}
            <Hr />
            <Row>
              <Column>
                <strong>Total</strong>
              </Column>
              <Column align="right">
                <strong>{`$${totalAmount}`}</strong>
              </Column>
            </Row>
          </Section>

          <Text>
            For questions, contact the posting Alumni or your chapter Admin.
          </Text>
        </Container>
      </Layout>
    </Html>
  );
}
