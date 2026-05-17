# Changelog

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
