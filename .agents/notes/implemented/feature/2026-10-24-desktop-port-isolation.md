# Agent Note: Desktop instance port isolation

Status: implemented

English | [中文](2026-10-24-desktop-port-isolation.zh.md)

## Problem

The company Desktop and an installed upstream Desktop or another development instance can compete for the same fixed listener port. Separate profiles and Electron userData do not isolate TCP listeners.

## Decision

`DSH-004` starts the company fork's Desktop Host with a system-assigned port. Installed and development applications use the actual address returned by the existing readiness IPC. The upstream application is unchanged. Explicit profile port overrides remain operator-owned.

## Alternatives considered

**Another fixed company port.** A different shared default still lets installed and development instances collide with each other. A system-assigned port provides instance isolation through the existing address-discovery path.

## Consequences

Development launchers retain separate homes, profiles and Electron userData. No launcher scans for a free port before binding, reserves another shared fixed port, terminates an unknown listener, or rewrites user configuration. Existing installed clients need a new build to adopt the source change.

## Verification and retirement

The startup regression starts concurrent listeners through the real startup entry and checks their reported addresses. Real Host subprocess verification covers concurrent boot and graceful shutdown while the old default port is occupied. Platform packaging and installed-window acceptance remain separate. Retire this company difference when the adopted upstream implementation provides equivalent instance isolation and address discovery.
