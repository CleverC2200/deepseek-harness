# Agent Note: Desktop update metadata check

Status: implemented

English | [中文](2026-11-04-desktop-update-check.zh.md)

## Problem

Company plugin coordination needs an exact native update candidate before caching its plugin suite. Opening the native update prompt can already start downloading.

## Decision

`DSH-005` adds a check-only action to the existing product preload update interface. It uses the existing schedule and coordinator, authenticates the owned top frame, and returns the existing presentation. URLs and installer authority remain in the main process. Callers may bind the native prompt to their confirmed version; a changed target is rejected.

## Alternatives considered

Opening the update prompt for discovery cannot guarantee preparation precedes downloading. A second update feed reader would duplicate native version selection.

## Consequences

The action neither downloads nor installs. Existing task and restart confirmations remain in force. Company plugins and bundled startup installation remain GEA-owned.

## Verification and retirement

Preload and startup tests cover the channel, renderer ownership, stale-target rejection and a check without download, installation or confirmation. Retire this company difference when the adopted native update interface provides an equivalent preparation action.
