import { describe, expect, it } from 'vitest';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { JOB_TRANSITIONS, transitionJob } from '../src/job-state-machine';
import {
  ConcurrentTransitionError,
  FsmViolationError,
  MinAdminInvariantError,
} from '../src/errors';

describe('JOB_TRANSITIONS map (unit, no DB)', () => {
  it('covers every JOB_STATE (terminals: empty object)', () => {
    for (const state of JOB_STATES) {
      expect(JOB_TRANSITIONS).toHaveProperty(state);
    }
    // Sanity: no extra keys outside JOB_STATES.
    expect(Object.keys(JOB_TRANSITIONS).sort()).toEqual([...JOB_STATES].sort());
  });

  it('every transition target is a valid JOB_STATE', () => {
    const validStates = new Set<string>(JOB_STATES);
    for (const [from, events] of Object.entries(JOB_TRANSITIONS)) {
      for (const [event, to] of Object.entries(events as Record<string, JobState>)) {
        expect(validStates.has(to), `${from} -> ${event} -> ${to} (invalid target)`).toBe(
          true,
        );
      }
    }
  });

  it('terminal states (closed, cancelled, rejected) have no outgoing transitions', () => {
    expect(JOB_TRANSITIONS.closed).toEqual({});
    expect(JOB_TRANSITIONS.cancelled).toEqual({});
    expect(JOB_TRANSITIONS.rejected).toEqual({});
  });

  it('approved is transient at the data layer (only the PRD-011 material_edit arrow is documented)', () => {
    // approveJob() handles the awaiting_moderation -> approved -> enrollment_open
    // two-row pattern atomically. `approved` is never persisted in jobs.state.
    // ADR-008 addendum (2026-05-21) added a documented material_edit arrow per
    // PRD-011 R-05 — runtime-unreachable today because no job ever rests in
    // `approved`, but recorded in the map so FSM authority covers the PRD.
    expect(JOB_TRANSITIONS.approved).toEqual({ material_edit: 'awaiting_moderation' });
  });

  it('encodes ADC-01 ST-03..ST-17 (excluding ST-01/ST-02 createJob + ST-05 system step)', () => {
    // ST-03 + ST-05 collapsed under awaiting_moderation.approve via approveJob (not transitionJob)
    expect(JOB_TRANSITIONS.awaiting_moderation.approve).toBe('enrollment_open');
    // ST-04
    expect(JOB_TRANSITIONS.awaiting_moderation.reject).toBe('rejected');
    // ST-06
    expect(JOB_TRANSITIONS.enrollment_open.lock).toBe('locked');
    // ST-07
    expect(JOB_TRANSITIONS.locked.reschedule).toBe('enrollment_open');
    // ST-08
    expect(JOB_TRANSITIONS.enrollment_open.cancel).toBe('cancelled');
    // ST-09
    expect(JOB_TRANSITIONS.locked.cancel).toBe('cancelled');
    // ST-10
    expect(JOB_TRANSITIONS.locked.complete).toBe('completed');
    // ST-11
    expect(JOB_TRANSITIONS.completed.revert).toBe('locked');
    // ST-12
    expect(JOB_TRANSITIONS.completed.payment_sent).toBe('payment_sent');
    // ST-13
    expect(JOB_TRANSITIONS.payment_sent.confirm_receipt).toBe('closed');
    // ST-14
    expect(JOB_TRANSITIONS.payment_sent.dispute).toBe('disputed');
    // ST-15
    expect(JOB_TRANSITIONS.disputed.resolve_closed).toBe('closed');
    // ST-16
    expect(JOB_TRANSITIONS.disputed.resolve_cancelled).toBe('cancelled');
    // ST-17
    expect(JOB_TRANSITIONS.disputed.resolve_payment_sent).toBe('payment_sent');
  });

  it('INV-13: no payment_sent -> completed direct revert', () => {
    // Only revert path is via the FSM's disputed -> payment_sent (Admin resolution);
    // there's no direct rollback from payment_sent to completed.
    expect(JOB_TRANSITIONS.payment_sent).not.toHaveProperty('revert');
    // Sanity check: revert lives on `completed` -> `locked`
    expect(JOB_TRANSITIONS.completed.revert).toBe('locked');
  });
});

describe('compile-time type narrowing (smoke test)', () => {
  // The `// @ts-expect-error` directive on the next statement IS the assertion.
  // If TS stops emitting the expected error for an illegal transition, this
  // directive itself becomes an error, failing typecheck.
  it("rejects illegal `transitionJob({ expectedFromState: 'closed', event: 'lock' })` at compile time", () => {
    type _Probe = () => Promise<void>;
    const _probe: _Probe = () =>
      transitionJob({
        jobId: '00000000-0000-0000-0000-000000000000',
        expectedFromState: 'closed',
        // @ts-expect-error closed is terminal; 'lock' is not a valid event on a terminal state.
        event: 'lock',
        actor: { id: '00000000-0000-0000-0000-000000000000', kind: 'user' },
      });
    expect(typeof _probe).toBe('function');
  });
});

describe('runtime FSM violation', () => {
  it("throws FsmViolationError if caller bypasses TS with an invalid event", async () => {
    await expect(
      transitionJob({
        jobId: '00000000-0000-0000-0000-000000000000',
        expectedFromState: 'closed',
        // Cast through `unknown` to simulate a non-TS caller (e.g., dynamic value).
        event: 'lock' as unknown as never,
        actor: { id: '00000000-0000-0000-0000-000000000000', kind: 'user' },
      }),
    ).rejects.toBeInstanceOf(FsmViolationError);
  });
});

describe('typed error classes carry expected .code', () => {
  it('FsmViolationError.code === "FSM_VIOLATION"', () => {
    expect(new FsmViolationError('x').code).toBe('FSM_VIOLATION');
  });
  it('ConcurrentTransitionError.code === "CONCURRENT_TRANSITION"', () => {
    expect(new ConcurrentTransitionError('x').code).toBe('CONCURRENT_TRANSITION');
  });
  it('MinAdminInvariantError.code === "MIN_ADMIN_INVARIANT_VIOLATED"', () => {
    expect(new MinAdminInvariantError('x').code).toBe('MIN_ADMIN_INVARIANT_VIOLATED');
  });
});
