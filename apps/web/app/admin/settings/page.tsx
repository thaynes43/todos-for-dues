import { getServerCaller } from '@/lib/trpc-server';
import { SettingsForm, type SettingsInitial } from '@/components/SettingsForm';
import { SETTING_KEYS } from '@app/api/settings-shared';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  const caller = await getServerCaller();
  const rows = await caller.settings.list();

  const initial: SettingsInitial[] = SETTING_KEYS.map((key) => {
    const row = rows.find((r) => r.key === key);
    const raw = row?.value;
    const value = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
    return { key, value };
  });

  return (
    <section className="space-y-8" data-testid="admin-settings">
      <PageHeader
        title="Settings"
        description="Chapter emails, timezone, and name — each field saves when you leave it."
      />
      <SettingsForm initial={initial} />
    </section>
  );
}
