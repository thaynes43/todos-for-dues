import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// MVP-FIX-A: server-component-hosted mutation buttons call `router.refresh()`
// in their `onSuccess`. Component tests render those buttons in isolation
// without an App Router context, so `useRouter()` throws "invariant expected
// app router to be mounted". A single global stub keeps per-test-file mocks
// unchanged while filling in the router for the bare-render cases. Individual
// files may still declare their own `vi.mock('next/navigation', …)` to add
// per-test control (e.g. `usePathname` return values).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  // vi.fn() so individual tests can override the return value
  // (`vi.mocked(usePathname).mockReturnValue('/jobs/new')`).
  usePathname: vi.fn(() => '/'),
}));

afterEach(() => {
  cleanup();
});
