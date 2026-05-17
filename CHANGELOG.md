# Changelog

## [0.7.0](https://github.com/thaynes43/todos-for-dues/compare/v0.6.0...v0.7.0) (2026-05-17)


### Features

* **ci:** SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook (PLAN-013) ([#27](https://github.com/thaynes43/todos-for-dues/issues/27)) ([bb4e94e](https://github.com/thaynes43/todos-for-dues/commit/bb4e94e947a356078cee6695ed59c8944dee85b4))


### Documentation

* **plan-013 + plan-014:** reshape PLAN-013 + commit deploy prompt 029 ([#25](https://github.com/thaynes43/todos-for-dues/issues/25)) ([741d04b](https://github.com/thaynes43/todos-for-dues/commit/741d04b425a26510157d1d966ec7c4c01e75bb77))

## [0.6.0](https://github.com/thaynes43/todos-for-dues/compare/v0.5.0...v0.6.0) (2026-05-17)


### Features

* **web:** Admin invite management UI + nav link + single-use token redemption per PRD-003 R-11..R-14 ([#24](https://github.com/thaynes43/todos-for-dues/issues/24)) ([e39cfc1](https://github.com/thaynes43/todos-for-dues/commit/e39cfc1dba2fda5394b459856b93bbe0a2419aea))


### Documentation

* **prd-003 + plan-014:** invite-management UI + admin nav fix scaffolding ([#22](https://github.com/thaynes43/todos-for-dues/issues/22)) ([b729c6e](https://github.com/thaynes43/todos-for-dues/commit/b729c6ed0ffaa85d77f6d9f036bdc7adf5c99c56))

## [0.5.0](https://github.com/thaynes43/todos-for-dues/compare/v0.4.0...v0.5.0) (2026-05-17)


### Features

* **web:** role management UI — profile self-service / Admin Users list / role history / min-Admin error per PRD-008 + DESIGN-006 ([#20](https://github.com/thaynes43/todos-for-dues/issues/20)) ([23a5371](https://github.com/thaynes43/todos-for-dues/commit/23a5371e10fe112f9aa9febc60d6c1cb431f3bb0))

## [0.4.0](https://github.com/thaynes43/todos-for-dues/compare/v0.3.0...v0.4.0) (2026-05-17)


### Features

* **web:** Admin view UI — Dashboard / Disputes (resolve) / Settings / Audit log / Users shell per PRD-007 + DESIGN-006 ([#17](https://github.com/thaynes43/todos-for-dues/issues/17)) ([776b40f](https://github.com/thaynes43/todos-for-dues/commit/776b40f3bae918cd7ff212e3677ef337873cbdd3))

## [0.3.0](https://github.com/thaynes43/todos-for-dues/compare/v0.2.3...v0.3.0) (2026-05-17)


### Features

* **web:** MVP job-loop UI completion — rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006 ([#14](https://github.com/thaynes43/todos-for-dues/issues/14)) ([a69af93](https://github.com/thaynes43/todos-for-dues/commit/a69af9355a55e354f2d2c55252a9dd12088ec0ce))

## [0.2.3](https://github.com/thaynes43/todos-for-dues/compare/v0.2.2...v0.2.3) (2026-05-17)


### Documentation

* **agents:** add coordinator + developer role profiles ([#9](https://github.com/thaynes43/todos-for-dues/issues/9)) ([09c1d7f](https://github.com/thaynes43/todos-for-dues/commit/09c1d7f4b400053936caece8c11c8c36354a5a3f))
* reconcile DESIGN-001 + PLAN-002/009/013 with PLAN-009 deploy reality ([#11](https://github.com/thaynes43/todos-for-dues/issues/11)) ([e54e076](https://github.com/thaynes43/todos-for-dues/commit/e54e076387ec07b8136d274816fbf60116083982))

## [0.2.2](https://github.com/thaynes43/todos-for-dues/compare/v0.2.1...v0.2.2) (2026-05-17)


### Bug Fixes

* **db:** min-Admin trigger no longer fires on INSERT ([#7](https://github.com/thaynes43/todos-for-dues/issues/7)) ([bd3a070](https://github.com/thaynes43/todos-for-dues/commit/bd3a070434de7d74215bb579bba47d7f7ef45bb3))

## [0.2.1](https://github.com/thaynes43/todos-for-dues/compare/v0.2.0...v0.2.1) (2026-05-17)


### Bug Fixes

* **auth:** add users.image column for Better Auth OIDC profile mapping ([#6](https://github.com/thaynes43/todos-for-dues/issues/6)) ([4625c9c](https://github.com/thaynes43/todos-for-dues/commit/4625c9c0eea8e2f835654ff4eeaad2dd585671d0))
* **release:** drop component prefix from release-please tags ([#4](https://github.com/thaynes43/todos-for-dues/issues/4)) ([7165b66](https://github.com/thaynes43/todos-for-dues/commit/7165b66416712d37fd1084b3b6f83583f2485366))

## [0.2.0](https://github.com/thaynes43/todos-for-dues/compare/todos-for-dues-v0.1.0...todos-for-dues-v0.2.0) (2026-05-17)


### Features

* **auth:** wire Better Auth + Workspace OIDC + invite tokens per DESIGN-004 ([5553619](https://github.com/thaynes43/todos-for-dues/commit/55536199a5bc7589593e308cf10a65bc5930fc0e))
* **db:** implement schema per DESIGN-001 — 8 tables + extensions + min-Admin trigger ([4b318e2](https://github.com/thaynes43/todos-for-dues/commit/4b318e25238ce35f88b87bca9982473798b3447b))
* **docker:** Dockerfile + Next.js standalone build ([0bc8a12](https://github.com/thaynes43/todos-for-dues/commit/0bc8a1265df0b4343f866afe0a398464387dfd56))
* **domain:** FSM helpers per DESIGN-002 — transitionJob/transitionRole + atomic audit-log writes + min-Admin error mapping ([f439d42](https://github.com/thaynes43/todos-for-dues/commit/f439d425d2e68cb72cb61f21b84e87ed9f4ce6a8))
* **notifications:** Resend adapter + 4 email templates per DESIGN-005 ([8da9c1f](https://github.com/thaynes43/todos-for-dues/commit/8da9c1fd5a0dfe3059ec9cf95014b368d0fc942d))
* **web:** walking-skeleton UI per DESIGN-006 §4.2 ([5ce00c7](https://github.com/thaynes43/todos-for-dues/commit/5ce00c78c7c28bf1553d2c0f95eea518577b9751))


### Bug Fixes

* **auth:** SSO button uses POST per Better Auth genericOAuth contract; defer 3 SSO Playwright specs to PLAN-008 ([7daab1c](https://github.com/thaynes43/todos-for-dues/commit/7daab1cb27b8a6a1c144e36e9abe37627f558a51))
* **lint:** disable no-undef in TS files ([3aaf946](https://github.com/thaynes43/todos-for-dues/commit/3aaf946799cbf485ddb312bd6bdd4df2dfe8c8c8))
* **web:** assert ClosedJobBanner absent + pageerror listener in walking-skeleton confirm-received spec ([c87e934](https://github.com/thaynes43/todos-for-dues/commit/c87e934e802db9a796c9a937c244aeedecb834ae))
