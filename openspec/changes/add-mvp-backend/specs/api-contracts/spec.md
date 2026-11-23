# Spec Delta

## Purpose

Gives the frontend one versioned source of truth for the API's request and response shapes, plus realistic sample data that is guaranteed to match them.

## ADDED Requirements

### Requirement: Published contracts package
The system SHALL publish a versioned package to GitHub Packages containing the schemas for every API request and response body, and the API SHALL validate requests against those same schemas at runtime; its responses SHALL conform to them, verified by tests.

#### Scenario: Request violates a schema
- **WHEN** a client sends a body that fails its request schema
- **THEN** the API responds 400 with the failing fields and reasons

#### Scenario: Frontend validates a response
- **WHEN** the frontend parses any API response with the package's matching schema
- **THEN** parsing succeeds

### Requirement: Sign-in error codes
The package SHALL export the `SigninErrorCode` enum (`cancelled`, `expired`, `deactivated`, `failed`) so the frontend can map each code to its own message.

#### Scenario: Frontend reads a sign-in error
- **WHEN** the app loads with a `signinError` query parameter
- **THEN** the frontend can validate it against `SigninErrorCode` and ignore any value outside the enum

### Requirement: Semantic versioning
The package SHALL follow semantic versioning, with a major version bump for any change that removes, renames or tightens a field, and SHALL be published only when its version changes.

#### Scenario: Field renamed
- **WHEN** a schema field is renamed
- **THEN** the next published version has a higher major version

### Requirement: Fixtures on a separate entry point
The package SHALL export sample fixtures for users, tournaments and the leaderboard from a separate `/fixtures` entry point, so importing the main entry point never includes fixture data.

#### Scenario: Production import
- **WHEN** the frontend imports only the package's main entry point
- **THEN** no fixture data is included

#### Scenario: Test import
- **WHEN** a frontend test imports from `/fixtures`
- **THEN** it receives typed sample users, tournaments and leaderboard entries

### Requirement: Fixtures always satisfy their schemas
Every exported fixture MUST pass runtime validation against its schema, and the package MUST NOT be published if any fixture fails.

#### Scenario: Schema tightened without updating a fixture
- **WHEN** a schema rule changes so an existing fixture no longer validates
- **THEN** the pull request check fails before the package can be published
