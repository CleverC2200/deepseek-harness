# Agent Note: Desktop download-content store reuse

Status: implemented

English | [中文](2026-10-22-desktop-download-store.zh.md)

## Problem

Repeated Desktop preparation downloads production dependencies into a temporary store that disappears with the installation graph, even when the caller already has reusable package content.

## Decision

`DSH-003` makes the bundled pnpm resolve the caller's content store before Desktop clears inherited package-manager configuration. An explicit absolute store override and an isolated cold-download mode remain available through the [Desktop packaging configuration](../../../../apps/desktop/README.md). The installation graph and package-manager configuration remain private to preparation. Shared content is never a cleanup target.

## Alternatives considered

Preserving all inherited package-manager configuration would also preserve authentication and installation-layout settings. Sharing node_modules would couple mutable production graphs. Hardcoding a user directory or appending a store version would duplicate pnpm's platform and version rules. Resolving the store through pnpm preserves those rules while passing only its selected path into the isolated installer.

## Consequences

This company difference covers build-time download selection only. It changes no runtime installation, identity, persistence or publication protocol. A shared store under a preparation cleanup directory is rejected before reset. Retire this implementation when upstream provides equivalent store selection with configuration isolation and movable runtime verification.

## Verification

The pnpm process tests cover default resolution, explicit paths, cold-store cleanup, invalid settings and configuration isolation. Existing materialization and runtime-integrity checks remain required for complete platform packaging. Source tests and selecting a populated store establish neither online cache-hit savings nor installed-client acceptance.
