# Agent Note: Plugin settings and update extension points

Status: implemented

English | [中文](2026-10-17-plugin-settings-and-update-extension-points.zh.md)

## Problem

Company plugin updates required opening each detail page, and management occupied the main sidebar. The existing installed cards lacked version and update extension positions. Rebuilding the official page or injecting DOM changes would separate its behavior and appearance from upstream.

## Decision

`DSH-001` keeps the official page, order, icons, controls and installation/configuration controller. The same page occupies the final `settings.section`; `pluginNavigation.openBundle` uses shell-owned `settingsNavigation.open` without selecting a workspace panel. Settings renders the existing official plugin icon for this entry. The existing inventory section remains separate.

Installed cards show their version. The badge and action slots receive the existing bundle subject, and the group tools slot receives installed package references. Actions and the switch share the content row. Manual refresh awaits the inventory and the callbacks registered by `plugins.list.tools`. Company metadata, release sources, update transaction state and policy remain in the company plugins.

The desktop product main frame receives a parameterless restart operation. The existing task confirmation can cancel it; repeated requests share one decision. Approval schedules relaunch and uses the existing Host shutdown. Other documents and subframes retain their existing sender restrictions. Web composition does not receive a restart operation.

## Alternatives considered

**A new plugin page or reordered official groups.** Rejected by the user. The official page remains the single manager, with Official before Installed.

**DOM patches or bundle string replacement.** Rejected because the source would no longer express the executed layout and navigation.

**Putting company update policy in Core.** Rejected because Core provides presentation and lifecycle capabilities while GEA owns the signed update transaction and its recovery.

Slot contract prose lives in the colocated `slot-contract.slots.json` file in both languages. The existing client catalog generator reads it and rejects unknown slots, incomplete translations and duplicate source documentation; undocumented slots still fail the original completeness check.

## Consequences

Core carries narrow list extension positions, settings navigation and a desktop lifecycle operation. Contributors implement company-specific behavior through them. The same package identity still drives installation and lookup even when localized metadata omits the personal account prefix from its title.

## Verification

Existing package tests cover registration, disposal, settings ordering, manual-refresh coalescing, retained installation behavior and detail navigation. Desktop tests cover sender rejection, repeated requests, cancellation without deferred relaunch and existing Host teardown. Company browser and real package-install/restart verification belong to the companion implementation; they do not imply release-channel or production-client acceptance.
