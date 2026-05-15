# @app/domain

FSM helpers + typed error classes for `jobs.state` and `users.role` mutations.

This package is the **single writer** of `jobs.state`, `users.role`,
`job_state_transitions`, and `user_role_transitions`. Every state-changing tRPC
procedure routes its mutation through `transitionJob`, `createJob`, `approveJob`,
`recordRelationshipEvent`, `transitionRole`, or `transitionRolesAtomically`.

A static-analysis test
(`packages/domain/__tests__/no-direct-state-writes.test.ts`) enforces the
single-writer invariant by grepping the repo for forbidden raw-SQL patterns.

See `docs/designs/002-fsm-module.md` for the design contract.
