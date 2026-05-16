import * as React from 'react';
import { Body, Container, Head, Preview, Section, Text } from '@react-email/components';

interface LayoutProps {
  preview?: string;
  children: React.ReactNode;
}

export function Layout({ preview, children }: LayoutProps): React.ReactElement {
  return (
    <>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f9fafb' }}>
        <Container style={{ padding: '24px', backgroundColor: '#ffffff', maxWidth: '600px' }}>
          {children}
          <Section style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <Text style={{ fontSize: '12px', color: '#6b7280' }}>
              TODOs for Dues — automated notification. Do not reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </>
  );
}
