# Spec Delta

## Purpose

Lets members attach a photo to a tournament and upload an avatar, while keeping images private and free of location metadata.

## ADDED Requirements

### Requirement: Authorized upload grants
The system SHALL issue a short-lived upload grant only to a user allowed to change the target: the tournament's recorder or an admin for a tournament photo, and the user themselves for an avatar.

#### Scenario: Recorder requests a photo upload
- **WHEN** the recorder of a tournament requests a photo upload grant for it
- **THEN** the system returns a grant that expires within 15 minutes

#### Scenario: Non-recorder requests a photo upload
- **WHEN** a member who is neither the recorder nor an admin requests a photo upload grant for a tournament
- **THEN** the system responds 403

### Requirement: Upload constraints
The system SHALL only accept JPEG, PNG, HEIC or WebP images of at most 10 MB, enforced by the storage service on the upload itself.

#### Scenario: Oversized file
- **WHEN** a client uploads a 12 MB image with a valid grant
- **THEN** the storage service rejects the upload and nothing is attached

#### Scenario: Disallowed type
- **WHEN** a client uploads a PDF with a valid grant
- **THEN** the upload is rejected

### Requirement: Explicit attachment
The system SHALL attach an uploaded image only when the client confirms the upload, and SHALL verify the object exists before attaching it; a tournament has at most one photo, and a new one replaces the old.

#### Scenario: Confirming an upload
- **WHEN** a client confirms a completed upload for a tournament
- **THEN** the tournament shows the photo and any previous photo is deleted

#### Scenario: Confirming a missing upload
- **WHEN** a client confirms an upload that never reached storage
- **THEN** the system responds 400 and nothing changes

#### Scenario: Removing a photo
- **WHEN** the recorder or an admin removes a tournament's photo
- **THEN** the tournament has no photo and the stored image is deleted

### Requirement: Metadata stripping and display variant
The system SHALL strip all EXIF and location metadata from every uploaded image and SHALL produce a resized display variant no larger than 1600 px on its longest side for a tournament photo and 512 px for an avatar; only processed images are ever served.

#### Scenario: Photo with GPS data
- **WHEN** a member uploads a photo containing GPS coordinates
- **THEN** no image served by the system contains those coordinates

#### Scenario: Avatar display size
- **WHEN** a member uploads a 3000 × 2000 px avatar
- **THEN** the avatar is served at 512 × 341 px

#### Scenario: Processing not yet finished
- **WHEN** a tournament is read before its photo has been processed
- **THEN** the response marks the photo as processing and serves no image URL

### Requirement: Private, time-limited image access
The system SHALL store images privately and serve them only through signed URLs that expire within 1 hour, issued in responses the requester is allowed to see.

#### Scenario: Member reads a tournament with a photo
- **WHEN** a member reads a tournament that has a processed photo
- **THEN** the response includes a signed photo URL that stops working after it expires

#### Scenario: Direct storage access
- **WHEN** anyone requests a stored image without a valid signed URL
- **THEN** storage denies the request
