# Spec Delta

## Purpose

Lets real players sign in with Google through the backend's auth layer, stay signed in via a secure session, become members of the single home-game group, and lets admins block abusive accounts.

## ADDED Requirements

### Requirement: Google sign-in through the auth layer
The system SHALL offer sign-in only via Google, started by the backend, and SHALL never expose identity-provider tokens to the browser.

#### Scenario: Starting sign-in
- **WHEN** a browser requests `GET /api/auth/login`
- **THEN** the system redirects it to the Google sign-in flow and sets a short-lived sign-in cookie

#### Scenario: Completing sign-in
- **WHEN** the identity provider redirects back to `GET /api/auth/callback` with a valid code and matching state
- **THEN** the system creates a session, sets the session cookie, deletes the sign-in cookie and redirects to the app; no identity-provider token appears in any response body, URL or script-readable cookie

### Requirement: Sign-in is bound to the initiating browser
The system SHALL reject a sign-in callback whose state does not match the sign-in cookie set by `/api/auth/login` in the same browser, or whose sign-in cookie is older than 10 minutes or already used.

#### Scenario: Callback without the sign-in cookie
- **WHEN** a callback arrives in a browser that did not start sign-in
- **THEN** the system creates no session and redirects to the app root with `signinError=failed`

#### Scenario: Callback with an unreadable sign-in cookie
- **WHEN** a callback arrives with a sign-in cookie that was tampered with or sealed with another key
- **THEN** the system creates no session and redirects to the app root with `signinError=failed`

#### Scenario: Sign-in cookie older than 10 minutes
- **WHEN** a callback arrives with a sign-in cookie issued more than 10 minutes earlier
- **THEN** the system creates no session and redirects to the app root with `signinError=expired`

#### Scenario: Replayed callback
- **WHEN** a callback URL that already completed sign-in is opened again
- **THEN** the system creates no new session and redirects to the app root with `signinError=failed`

### Requirement: Sign-in failures are reported to the app
The system SHALL end every failed sign-in callback by redirecting to the app root with a `signinError` code (`cancelled`, `expired`, `deactivated` or `failed`) and a `ref` request identifier, SHALL create no session and delete the sign-in cookie, SHALL log the detailed failure reason under that `ref`, and SHALL NOT place message text in the redirect.

#### Scenario: User cancels at Google
- **WHEN** the identity provider returns `error=access_denied` to the callback
- **THEN** the system redirects to the app root with `signinError=cancelled`

#### Scenario: Unexpected failure
- **WHEN** the callback fails on state mismatch, code exchange or ID-token verification
- **THEN** the system redirects to the app root with `signinError=failed` and a `ref`, and the detailed reason is logged under that `ref`

#### Scenario: No message text in the redirect
- **WHEN** any sign-in callback fails
- **THEN** the redirect URL carries only the `signinError` code and `ref`, never a human-readable message

### Requirement: Safe return after sign-in
The system SHALL return the user after sign-in only to a relative path within the app; any other `returnTo` value SHALL be replaced by the app root.

#### Scenario: Off-site returnTo
- **WHEN** sign-in starts with `returnTo=https://evil.example`
- **THEN** after sign-in the user lands on the app root

### Requirement: Session cookie
The system SHALL identify a signed-in user by an opaque session cookie that is `HttpOnly`, `Secure`, `SameSite=Strict` and host-only, and SHALL issue a new session identifier at every sign-in.

#### Scenario: Cookie attributes
- **WHEN** sign-in completes
- **THEN** the session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, has no `Domain` attribute and differs from any previous session identifier

### Requirement: Session lifetime
A session SHALL expire after 30 days without use and in any case 90 days after sign-in.

#### Scenario: Idle session
- **WHEN** a session is used after 31 days of inactivity
- **THEN** the system responds 401 and the user must sign in again

#### Scenario: Active but old session
- **WHEN** a session used daily reaches 90 days since sign-in
- **THEN** the system responds 401 and the user must sign in again

### Requirement: Members-only access
The system SHALL reject every endpoint other than the public leaderboard and the sign-in endpoints when the request has no valid session.

#### Scenario: No session
- **WHEN** a client calls a members-only endpoint without a session cookie
- **THEN** the system responds 401 and returns no data

#### Scenario: Unknown or expired session
- **WHEN** a client sends a session cookie that does not match an active session
- **THEN** the system responds 401

### Requirement: Cross-site request protection
The system SHALL reject any request other than `GET`, `HEAD` or `OPTIONS` whose `Origin` header is missing or not the app's own origin, and SHALL accept request bodies only as JSON.

#### Scenario: Cross-site POST
- **WHEN** a request to create a tournament carries a valid session cookie but `Origin: https://other.example`
- **THEN** the system responds 403 and changes nothing

#### Scenario: Form-encoded body
- **WHEN** a data-changing request is sent as `application/x-www-form-urlencoded`
- **THEN** the system responds 415

### Requirement: Sign-out
The system SHALL end the session on `POST /api/auth/logout`, clear the session cookie and sign the user out of the identity provider.

#### Scenario: Signing out
- **WHEN** a signed-in user signs out
- **THEN** the session no longer authenticates any request and the browser is sent to the identity provider's sign-out

### Requirement: Account provisioning at sign-in
The system SHALL create a user account the first time an identity completes sign-in, storing its email, Google display name and Google avatar URL, and SHALL refresh those values on later sign-ins.

#### Scenario: First sign-in
- **WHEN** a new identity completes sign-in
- **THEN** the system creates exactly one account for it

#### Scenario: Concurrent first sign-ins
- **WHEN** the same new identity completes sign-in in two browsers at once
- **THEN** the system still ends up with exactly one account

### Requirement: Automatic group membership
The system SHALL make every provisioned account a member of the single group, with no invitation, acceptance or manual add step.

#### Scenario: New account joins the group
- **WHEN** an account is provisioned
- **THEN** it is a member of the group and can be selected as a tournament participant by other members

### Requirement: Admin role
The system SHALL treat a user as an admin only when the identity provider asserted admin group membership at their most recent sign-in.

#### Scenario: Non-admin calls an admin action
- **WHEN** a user without the admin assertion calls an admin-only endpoint
- **THEN** the system responds 403

#### Scenario: Admin granted after sign-in
- **WHEN** a user is added to the admin group while already signed in
- **THEN** they gain admin access at their next sign-in

### Requirement: Account deactivation
The system SHALL let an admin deactivate and reactivate any account but their own; deactivation SHALL end all of that user's sessions and block new sign-ins, while their tournaments, stats and leaderboard placement remain unchanged.

#### Scenario: Deactivating a signed-in user
- **WHEN** an admin deactivates a user who has active sessions
- **THEN** that user's next request responds 401

#### Scenario: Deactivated user signs in
- **WHEN** a deactivated user completes Google sign-in
- **THEN** the system creates no session and redirects to the app root with `signinError=deactivated`

#### Scenario: Deactivated user's history
- **WHEN** an account is deactivated
- **THEN** that user's tournaments, stats and leaderboard entry are still returned to other members and on the public leaderboard

#### Scenario: Reactivation
- **WHEN** an admin reactivates a deactivated account
- **THEN** that user can sign in again

#### Scenario: Admin deactivates their own account
- **WHEN** an admin asks to deactivate their own account
- **THEN** the system responds 400 with `cannot_deactivate_self`, and the account and its sessions are unchanged

### Requirement: No self-service account deletion
The system SHALL NOT expose any endpoint for users to delete their own account.

#### Scenario: User looks for account deletion
- **WHEN** a user calls any endpoint attempting to delete their own account
- **THEN** no such operation exists and the account is unchanged
