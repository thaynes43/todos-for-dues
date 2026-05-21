import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// MVP-FIX-A: server-component-hosted mutation buttons call `router.refresh()`
// in their `onSuccess`. Component tests render those buttons in isolation
// without an App Router context, so `useRouter()` throws "invariant expected
// app router to be mounted". A single global stub (mirrors the `vi.mock` in
// `RoleChangeDropdown.test.tsx` and `UserListTable.test.tsx`) keeps the
// per-test-file mocks unchanged while filling in router for the bare-render
// cases.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

afterEach(() => {
  cleanup();
});
