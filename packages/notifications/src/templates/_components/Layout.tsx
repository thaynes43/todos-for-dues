import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Preview,
  Section,
  Text,
} from '@react-email/components';

/*
 * Sigo design-system v1.1 for email: stone neutrals, the fraternity greens
 * (#4a7530 fill / #588838 accents), 16px body floor, 8px control radius.
 * Emails are always light — most clients ignore dark-mode CSS.
 */
export const emailColors = {
  page: '#fafaf9', // stone-50
  surface: '#ffffff',
  border: '#e7e5e4', // stone-200
  text: '#1c1917', // stone-900
  muted: '#78716c', // stone-500
  accent: '#588838',
  accentStrong: '#4a7530',
} as const;

export const emailText: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: emailColors.text,
  margin: '8px 0',
};

export const emailHeading: React.CSSProperties = {
  fontSize: '22px',
  lineHeight: '1.3',
  fontWeight: 600,
  color: emailColors.text,
  margin: '16px 0 8px',
};

export const emailButton: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: emailColors.accentStrong,
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: '8px',
  padding: '10px 20px',
};

interface LayoutProps {
  preview?: string;
  children: React.ReactNode;
}

export function Layout({ preview, children }: LayoutProps): React.ReactElement {
  return (
    <>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          backgroundColor: emailColors.page,
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            padding: '32px',
            backgroundColor: emailColors.surface,
            maxWidth: '600px',
            borderRadius: '16px',
            border: `1px solid ${emailColors.border}`,
          }}
        >
          {/* TODO(tom): "Sigo Dues" is the working name — see apps/web/app/layout.tsx. */}
          <Text
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: emailColors.accentStrong,
              margin: '0 0 4px',
            }}
          >
            Sigo Dues
          </Text>
          <Hr style={{ borderColor: emailColors.border, margin: '12px 0 4px' }} />
          {children}
          <Section style={{ marginTop: '32px' }}>
            <Hr style={{ borderColor: emailColors.border, margin: '0 0 12px' }} />
            <Text style={{ fontSize: '13px', color: emailColors.muted, margin: 0 }}>
              Sigo Alumni — <em>Non Sibi Sed Omnibus</em>
            </Text>
            <Text style={{ fontSize: '13px', color: emailColors.muted, margin: '4px 0 0' }}>
              Automated message — replies aren&apos;t read. Questions?{' '}
              admin@sigoalumni.org
            </Text>
          </Section>
        </Container>
      </Body>
    </>
  );
}
