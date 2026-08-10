'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import { SETTING_VALIDATORS, type SettingKey } from '@app/api/settings-shared';
import { trpc } from '@/lib/trpc-client';
import { Input } from '@/components/ui/input';

interface FieldDef {
  key: SettingKey;
  label: string;
  helper: string;
  type: 'email' | 'text';
}

const FIELDS: ReadonlyArray<FieldDef> = [
  {
    key: 'admin_recipient_email',
    label: 'Admin recipient email',
    helper: 'Where Admin-only notifications (disputes, etc.) are delivered.',
    type: 'email',
  },
  {
    key: 'treasurer_recipient_email',
    label: 'Treasurer recipient email',
    helper:
      'Receives the payment-sent email so the treasurer can credit the Active(s).',
    type: 'email',
  },
  {
    key: 'moderators_recipient_email',
    label: 'Moderators recipient email',
    helper: 'Receives new-posting notifications for the moderation queue.',
    type: 'email',
  },
  {
    key: 'chapter_timezone',
    label: 'Chapter timezone',
    helper:
      'IANA timezone string used for chapter-local date display (e.g., America/New_York).',
    type: 'text',
  },
  {
    key: 'chapter_display_name',
    label: 'Chapter display name',
    helper: 'Shown in the header and in outbound email subjects.',
    type: 'text',
  },
];

const DEBOUNCE_MS = 200;

export interface SettingsInitial {
  key: SettingKey;
  value: string;
}

export function SettingsForm({
  initial,
}: {
  initial: ReadonlyArray<SettingsInitial>;
}) {
  const initialMap = new Map(initial.map((r) => [r.key, r.value]));
  const [values, setValues] = useState<Record<SettingKey, string>>(
    () =>
      Object.fromEntries(
        FIELDS.map((f) => [f.key, initialMap.get(f.key) ?? '']),
      ) as Record<SettingKey, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});
  const [savedAt, setSavedAt] = useState<Partial<Record<SettingKey, number>>>(
    {},
  );

  const timersRef = useRef<Partial<Record<SettingKey, ReturnType<typeof setTimeout>>>>(
    {},
  );
  const toastTimerRef = useRef<Partial<Record<SettingKey, ReturnType<typeof setTimeout>>>>(
    {},
  );

  useEffect(() => {
    const timers = timersRef.current;
    const toastTimers = toastTimerRef.current;
    return () => {
      for (const t of Object.values(timers)) if (t) clearTimeout(t);
      for (const t of Object.values(toastTimers)) if (t) clearTimeout(t);
    };
  }, []);

  const setMutation = trpc.settings.set.useMutation();

  const flashSaved = useCallback((key: SettingKey) => {
    setSavedAt((prev) => ({ ...prev, [key]: Date.now() }));
    const prevTimer = toastTimerRef.current[key];
    if (prevTimer) clearTimeout(prevTimer);
    toastTimerRef.current[key] = setTimeout(() => {
      setSavedAt((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 3000);
  }, []);

  const persist = useCallback(
    (key: SettingKey, raw: string) => {
      const validator = SETTING_VALIDATORS[key];
      const parsed = validator.safeParse(raw);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(', ');
        setErrors((prev) => ({ ...prev, [key]: msg }));
        return;
      }
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setMutation.mutate(
        { key, value: parsed.data as unknown },
        {
          onSuccess: () => {
            flashSaved(key);
          },
          onError: (err) => {
            setErrors((prev) => ({ ...prev, [key]: err.message }));
          },
        },
      );
    },
    [setMutation, flashSaved],
  );

  const handleChange = (key: SettingKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValues((prev) => ({ ...prev, [key]: v }));
    const pending = timersRef.current[key];
    if (pending) {
      clearTimeout(pending);
      delete timersRef.current[key];
    }
  };

  const handleFocus = (key: SettingKey) => () => {
    const pending = timersRef.current[key];
    if (pending) {
      clearTimeout(pending);
      delete timersRef.current[key];
    }
  };

  const handleBlur = (key: SettingKey) => (e: FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const pending = timersRef.current[key];
    if (pending) clearTimeout(pending);
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      persist(key, value);
    }, DEBOUNCE_MS);
  };

  return (
    <form
      data-testid="settings-form"
      className="space-y-5"
      onSubmit={(e) => e.preventDefault()}
    >
      {FIELDS.map((field) => {
        const error = errors[field.key];
        const recentlySaved = savedAt[field.key] != null;
        return (
          <div
            key={field.key}
            className="space-y-1"
            data-testid={`settings-field-${field.key}`}
          >
            <label
              htmlFor={`setting-${field.key}`}
              className="block text-sm font-medium"
            >
              {field.label}
            </label>
            <Input
              id={`setting-${field.key}`}
              name={field.key}
              type={field.type}
              data-testid={`settings-input-${field.key}`}
              value={values[field.key]}
              onChange={handleChange(field.key)}
              onFocus={handleFocus(field.key)}
              onBlur={handleBlur(field.key)}
              aria-invalid={error != null}
              aria-describedby={`setting-help-${field.key}`}
            />
            <p
              id={`setting-help-${field.key}`}
              className="text-sm opacity-70"
            >
              {field.helper}
            </p>
            {error ? (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
                data-testid={`settings-error-${field.key}`}
              >
                {error}
              </p>
            ) : null}
            {recentlySaved ? (
              <p
                role="status"
                className="text-sm text-emerald-700 dark:text-emerald-300"
                data-testid={`settings-saved-${field.key}`}
              >
                Saved.
              </p>
            ) : null}
          </div>
        );
      })}
    </form>
  );
}
