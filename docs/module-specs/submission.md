# Submission

## 1. Purpose

Prepare the repository and deployed app for final review.

## 2. Phase

Phase 7 - Deploy Verification, README, Submission.

## 3. Ownership

Documentation, deployment configuration, final audit, and final demo verification.

## 4. Inputs And Outputs

Inputs:

- Completed app.
- Deployed URL.
- Source repository.

Outputs:

- Complete README.
- Clean secret audit.
- Final end-to-end verification notes.

## 5. Public Interfaces

- Public repository.
- Public deployed application URL.

## 6. Dependencies

Allowed:

- Deployment host configuration.
- Secret scanning commands.
- Existing test suites and manual checklist.

Forbidden:

- Real secrets in source control.
- Last-minute feature additions that bypass tests.

## 7. Error Behavior

Document known limitations honestly. Do not hide failing checks.

## 8. Tests Required

- Secret audit.
- Backend tests.
- Frontend checks.
- Live single-label flow.
- Live batch flow.
- Warning exact-match case.
- Imperfect-image case.

## 9. Exit Criteria

- README includes setup, run, deployed URL, approach, tools, assumptions, and limitations.
- Audit confirms `.env` and secrets are not committed.
- Live demo works end to end.
- README honestly documents whether warning styling detection is supported or out of scope.

## 10. Files Likely Touched

- `README.md`
- deployment config files
- final audit notes
