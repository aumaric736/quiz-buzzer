<!--
Sync Impact Report
Version change: unresolved template → 1.0.0 (initial project constitution)
Modified principles: none (initial adoption)
Added sections: Core Principles (8 principles), Security and Quality Constraints,
  Development Workflow
Removed sections: none
Follow-up TODOs: Ratification date is unknown and must be confirmed before adoption.
-->
# Quiz Buzzer Constitution

## Core Principles

### I. Validated Inputs and Clear Errors
Every feature MUST validate all user, system, and external inputs at its trust
boundaries. Invalid inputs MUST produce clear, actionable error messages without
exposing secrets or internal implementation details. This keeps failures
understandable and prevents invalid state from entering the system.

### II. Secret Handling
Passwords, API keys, OAuth credentials, and other secrets MUST be supplied only
through environment variables. They MUST NOT be committed to source code,
documentation, logs, or prompts. The repository MUST include `.env.example`
with placeholder variable names and MUST exclude `.env` through `.gitignore`.

### III. Evidence-Based Testing
Each core feature MUST have tests covering at least one normal case and one
boundary case. Completion reports MUST include the exact test command and its
result; an assertion that an AI agent completed the work is not verification.
Tests provide repeatable evidence that behavior meets its requirements.

### IV. Attributed Dependencies and Materials
External packages, datasets, and code MUST identify their source and applicable
license in an appropriate repository record. Materials whose provenance or
license cannot be established MUST NOT be incorporated.

### V. Verifiable Behavior
Business rules and data behavior MUST be verifiable through application logic
and tests or other repeatable checks. A frontend-only mockup MUST NOT be
presented as a functioning feature.

### VI. Clear Structure and Consistent Data
Code MUST use a clear structure, preserve data consistency, and handle errors
explicitly. Feature boundaries and data ownership MUST be understandable from
the implementation and its supporting specifications.

### VII. Subfeature-Based Delivery
Specifications, plans, and task lists MUST be organized by subfeature. Each
subfeature MUST be developed on its own branch so its scope and review history
remain traceable.

### VIII. Design-First with PlantUML
During `$speckit-specify`, each subfeature MUST include PlantUML component,
class, and sequence diagrams as `.puml` files in `./diagrams/`. After creation,
all `.puml` files MUST be rendered to PNG files in the same directory using
`java -jar plantuml.jar "./diagrams/*.puml"`. `$speckit-plan` MUST use these
diagrams as primary architecture blueprints. After `$speckit-implement`, the
implementation MUST be checked against the diagrams, and any divergence MUST
be corrected or reflected in updated diagrams. This makes architectural intent
reviewable through specification, planning, and implementation.

## Security and Quality Constraints

The repository MUST keep `.env.example` synchronized with required environment
variable names without including real values. Error messages and logs MUST
exclude secrets. Dependencies and imported materials MUST retain source and
license attribution in the repository.

## Development Workflow

For each subfeature, maintain its own spec, plan, tasks, and branch. The
specification stage produces the required PlantUML diagrams; planning derives
architecture from them; implementation verifies code against them. Before
reporting a core feature complete, run its normal and boundary tests and report
the command and result. Reviews MUST check input validation, secret handling,
data consistency, attribution, tests, and diagram alignment where applicable.

## Governance

This constitution governs project specifications, plans, implementation, and
reviews. Amendments MUST update this document and its version/date metadata.
Versioning follows semantic versioning: MAJOR for incompatible removals or
redefinitions of governance, MINOR for new principles or materially expanded
requirements, and PATCH for clarifications or non-semantic edits. Every
subfeature review MUST assess compliance with applicable principles; exceptions
MUST be documented in the subfeature artifacts with rationale and scope.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): confirm original adoption date | **Last Amended**: 2026-11-18
