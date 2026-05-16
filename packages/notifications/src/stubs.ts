// Notification stubs — PLAN-005 calls into these so PLAN-007 can replace the
// implementations without changing any call site. Each helper logs its input
// and resolves; tests assert call counts by spying on the exported functions.

export interface ModeratorQueueEmailInput {
  jobId: string;
}

export interface TreasurerEmailInput {
  jobId: string;
  recipient: string | null;
}

export interface AdminDisputeEmailInput {
  jobId: string;
  disputerId: string;
  reason: string;
  recipient: string | null;
}

export async function sendModeratorQueueEmail(input: ModeratorQueueEmailInput): Promise<void> {
  console.log('[notifications stub] sendModeratorQueueEmail', input);
}

export async function sendTreasurerEmail(input: TreasurerEmailInput): Promise<void> {
  console.log('[notifications stub] sendTreasurerEmail', input);
}

export async function sendAdminDisputeEmail(input: AdminDisputeEmailInput): Promise<void> {
  console.log('[notifications stub] sendAdminDisputeEmail', input);
}
