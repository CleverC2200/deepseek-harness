# Agent Note: Product Session feedback submission

Status: implemented

English | [中文](2026-11-11-session-feedback-submit.zh.md)

## Problem

A local `feedback/record` event confirms a Session remark, but cannot acknowledge a product feedback service accepting conversation materials. Products own authenticated uploads and their receipts.

## Decision

`DSH-006` adds a single product submission provider to `sessionFeedback`. Core owns description validation, Remote transport and the shared dialog lifecycle. The provider owns authentication, collection, upload and the accepted receipt. The Session form uses this operation; typed `/feedback <text>` and message ratings retain their existing log events. The [shared-dialog decision](2026-09-08-feedback-dialog-and-categories.md) continues to own message categories and entry points.

## Alternatives considered

Routing product uploads through `feedback/record` would combine telemetry authorization with an unrelated authenticated upload and could display success before product acceptance. A product-specific dialog would duplicate the existing draft and disposal lifecycle.

## Consequences

A missing provider leaves the draft open with an unavailable error. Only a successful provider response displays a report id and received time. Products must provide failures suitable for display; generic transport failures use Core locale text.

## Verification and retirement

Provider, dialog and assembled Web tests cover unavailable service, required descriptions, receipt routing and stale results. Retire this company difference when the adopted upstream feedback interface supports product-owned submission with the same receipt semantics.
