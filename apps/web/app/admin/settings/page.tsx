import { getServerCaller } from '@/lib/trpc-server';
import { SettingsForm, type SettingsInitial } from '@/components/SettingsForm';
import { SETTING_KEYS } from '@app/api/settings-shared';

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
    <section className="space-y-4" data-testid="admin-settings">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Per-field, save-on-blur. Invalid input is rejected without overwriting
          the stored value.
        </p>
      </header>
      <SettingsForm initial={initial} />
    </section>
  );
}
