'use client';

import { useState } from 'react';
import type { Role } from '@app/db/schema';
import { RoleChangeDropdown } from '@/components/RoleChangeDropdown';
import { MinAdminErrorBanner } from '@/components/MinAdminErrorBanner';

export function ProfileRoleSection({ role }: { role: Role }) {
  const [minAdminError, setMinAdminError] = useState(false);
  const canPromote = role === 'Admin';

  return (
    <div className="space-y-3" data-testid="profile-role-section">
      {minAdminError ? (
        <MinAdminErrorBanner canPromote={canPromote} returnTo="/profile" />
      ) : null}
      <RoleChangeDropdown
        currentRole={role}
        onMinAdminError={() => setMinAdminError(true)}
        onSuccess={() => setMinAdminError(false)}
      />
    </div>
  );
}
