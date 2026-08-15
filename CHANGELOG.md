# Changelog

## [2.0.0](https://github.com/thaynes43/todos-for-dues/compare/v1.1.1...v2.0.0) (2026-08-15)


### ⚠ BREAKING CHANGES

* users.role enum drops Active/Alumni (Alumni renamed to Member); the users.changeRole and users.grantRole tRPC procedures are removed. Migration 0012 data-migrates existing Active/Alumni role rows to Member.

### Features

* member status orthogonal to roles (backlog 07 ruling) ([#60](https://github.com/thaynes43/todos-for-dues/issues/60)) ([6ad7675](https://github.com/thaynes43/todos-for-dues/commit/6ad767527d83907ff4238e5ec4dbd6807364917b))

## [1.1.1](https://github.com/thaynes43/todos-for-dues/compare/v1.1.0...v1.1.1) (2026-08-14)


### Bug Fixes

* **profile:** fallback Active/Alumni toggle wedged after one flip ([#58](https://github.com/thaynes43/todos-for-dues/issues/58)) ([155400e](https://github.com/thaynes43/todos-for-dues/commit/155400e3912679d8a6c561ef98759f11c9f365ad))

## [1.1.0](https://github.com/thaynes43/todos-for-dues/compare/v1.0.0...v1.1.0) (2026-08-14)


### Features

* **profile:** member status designation via portal registry (sigo-alumni backlog 07) ([#57](https://github.com/thaynes43/todos-for-dues/issues/57)) ([fa9b148](https://github.com/thaynes43/todos-for-dues/commit/fa9b1484c51d3c1da4a0dfad2cd7eb73e2a055d2))
* **profile:** self-set member status (Active/Alumni) via the portal registry ([#56](https://github.com/thaynes43/todos-for-dues/issues/56)) ([9044b1c](https://github.com/thaynes43/todos-for-dues/commit/9044b1c4ab984cbc5c38798f1d94ecf8b907629b))


### Documentation

* **plan:** record P4 done — v1.0.0 deployed via haynes-ops [#2389](https://github.com/thaynes43/todos-for-dues/issues/2389) ([#54](https://github.com/thaynes43/todos-for-dues/issues/54)) ([7b2390b](https://github.com/thaynes43/todos-for-dues/commit/7b2390bde242c5caf5ea55508ba209aeea1de672))

## [1.0.0](https://github.com/thaynes43/todos-for-dues/compare/v0.8.1...v1.0.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **auth:** local credential auth and invite onboarding are removed; sign-in requires the sigoalumni.org portal (OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / OIDC_DISCOVERY_URL). OIDC_HOSTED_DOMAIN and BOOTSTRAP_ADMIN_EMAIL are dropped. Migration 0011 wipes existing users.

### Features

* **auth:** portal SSO replaces local auth (ADR 0007 / ADR-013) ([#52](https://github.com/thaynes43/todos-for-dues/issues/52)) ([8d85ee0](https://github.com/thaynes43/todos-for-dues/commit/8d85ee0c0bf91add88a55bc7a7854e9e65074904))
* **ui:** Sigo rebrand — design-system v1.1 ([#53](https://github.com/thaynes43/todos-for-dues/issues/53)) ([00e7aac](https://github.com/thaynes43/todos-for-dues/commit/00e7aac2b2dbe19b86efec286babd4d62e4c21ac))


### Bug Fixes

* **security:** Phase 1 modernization — audit hotfixes + security dependency wave ([#50](https://github.com/thaynes43/todos-for-dues/issues/50)) ([48a0cf5](https://github.com/thaynes43/todos-for-dues/commit/48a0cf54814a921ffc24abd03fd8065d31a87910))

## [0.8.1](https://github.com/thaynes43/todos-for-dues/compare/v0.8.0...v0.8.1) (2026-08-10)


### Documentation

* **agents:** deploy prompt 044 — v0.8.0 MVP-FIX-C wave to haynes-ops ([#47](https://github.com/thaynes43/todos-for-dues/issues/47)) ([48cdbd2](https://github.com/thaynes43/todos-for-dues/commit/48cdbd2a9ac6cfbcea3b035b1baa3d23aeb0a2cb))
* **audit:** 2026-08 modernization audit + phased implementation plan ([#49](https://github.com/thaynes43/todos-for-dues/issues/49)) ([eb28953](https://github.com/thaynes43/todos-for-dues/commit/eb28953513e99ce6664ea0aa5b2d290abb69f7bc))

## [0.8.0](https://github.com/thaynes43/todos-for-dues/compare/v0.7.3...v0.8.0) (2026-05-21)


### Features

* **web:** job content enrichment — poster contact / location / duration / notes (PRD-010 / PLAN-016) ([#44](https://github.com/thaynes43/todos-for-dues/issues/44)) ([6b2453f](https://github.com/thaynes43/todos-for-dues/commit/6b2453f3d2ab199365a00f6bae80272ec6f2bbc1))
* **web:** job editability before lock (PRD-011 / PLAN-017) — EditJob command + re-moderation + diff audit ([#45](https://github.com/thaynes43/todos-for-dues/issues/45)) ([8beb09b](https://github.com/thaynes43/todos-for-dues/commit/8beb09bab684e0ef8a0614b35ca0c0fb3ff16033))
* **web:** real-time UI updates via SSE (PRD-012 / ADR-012 / PLAN-018) ([#46](https://github.com/thaynes43/todos-for-dues/issues/46)) ([7f710c5](https://github.com/thaynes43/todos-for-dues/commit/7f710c5774880a63670348529ad424e5d5aed14e))


### Bug Fixes

* **web:** MVP polish — active-nav highlight + RBAC payment-sent buttons + lock validation surfacing ([#43](https://github.com/thaynes43/todos-for-dues/issues/43)) ([3dc3c44](https://github.com/thaynes43/todos-for-dues/commit/3dc3c4499d4a88a3749653996d293d9e73ac285d))
* **web:** router.refresh after mutation onSuccess in server-component pages (stale UI bug) ([#42](https://github.com/thaynes43/todos-for-dues/issues/42)) ([64ee210](https://github.com/thaynes43/todos-for-dues/commit/64ee2101b36722c82075f17a166d0abefdf82375))


### Documentation

* **agents:** reorganize prompts (implemented/mvp + mvp_fixes) + add prompts 036 + 037 ([#40](https://github.com/thaynes43/todos-for-dues/issues/40)) ([cc2fdf4](https://github.com/thaynes43/todos-for-dues/commit/cc2fdf4ce2ff119dcf27e90357a1afb6966a2a7f))
* **plan-013 + runbook + handoff-014:** MVP wrap-up — §3.1 closeouts + trap-resolution banner + deploy prompt 035 ([#38](https://github.com/thaynes43/todos-for-dues/issues/38)) ([07d442a](https://github.com/thaynes43/todos-for-dues/commit/07d442a1f71d1db9be5826c262095a0456c68d04))
* **prd/adr/plans:** MVP-FIX-C feature wave — PRD-010/011/012 + ADR-012 + PLAN-016/017/018 + 6 prompts ([#41](https://github.com/thaynes43/todos-for-dues/issues/41)) ([f29f7fc](https://github.com/thaynes43/todos-for-dues/commit/f29f7fc0e2b1ea284ff80c545305340791cda4f1))

## [0.7.3](https://github.com/thaynes43/todos-for-dues/compare/v0.7.2...v0.7.3) (2026-05-18)


### Bug Fixes

* **e2e:** signInAs waitForURL glob mismatch + full suite-level collapse ([#36](https://github.com/thaynes43/todos-for-dues/issues/36)) ([5b2ac85](https://github.com/thaynes43/todos-for-dues/commit/5b2ac85a579871442694f7e4b7c238874d5f11c1))

## [0.7.2](https://github.com/thaynes43/todos-for-dues/compare/v0.7.1...v0.7.2) (2026-05-18)


### Bug Fixes

* **e2e:** scope-narrow demoteAllOtherAdmins + self-filter invites count + partial e2e.yml collapse ([#35](https://github.com/thaynes43/todos-for-dues/issues/35)) ([73df916](https://github.com/thaynes43/todos-for-dues/commit/73df916289eb33b3faaa142f49bce54fd8fcc02d))


### Documentation

* **agents:** handoff 013 + commit deploy prompt 032 ([#32](https://github.com/thaynes43/todos-for-dues/issues/32)) ([1694de1](https://github.com/thaynes43/todos-for-dues/commit/1694de1dc564042bef0b3ec65bd8f61d44a7c040))

## [0.7.1](https://github.com/thaynes43/todos-for-dues/compare/v0.7.0...v0.7.1) (2026-05-18)


### Bug Fixes

* **ci:** hybrid trigger for build-image — release.published from GITHUB_TOKEN is suppressed too ([#30](https://github.com/thaynes43/todos-for-dues/issues/30)) ([588c673](https://github.com/thaynes43/todos-for-dues/commit/588c6732e8e5ffc688ca9ce060dc6bb5302f0a64))


### Documentation

* **plan-013 + handoff-012:** track iteration-2 reality + 8 architecture follow-ups ([#28](https://github.com/thaynes43/todos-for-dues/issues/28)) ([9daad2a](https://github.com/thaynes43/todos-for-dues/commit/9daad2acfa4aa2aa0f5f9ecf60d8ba8cda72a79b))

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
