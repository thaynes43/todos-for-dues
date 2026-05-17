-- Better Auth 1.6's profile-mapping flow for genericOAuth writes the OIDC
-- "picture" claim into users.image. Without this column the user-row insert
-- fails server-side ("The field 'image' does not exist in the 'users' Drizzle
-- schema"), the OAuth callback completes without setting a session cookie,
-- and the browser bounces back to /login. Adding the column unblocks SSO.

ALTER TABLE "users" ADD COLUMN "image" text;
