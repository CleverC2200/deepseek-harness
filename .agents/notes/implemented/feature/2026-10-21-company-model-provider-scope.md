# Agent Note: Company model provider scope

Status: implemented

English | [中文](2026-10-21-company-model-provider-scope.zh.md)

## Problem

The company client presents direct providers beside models discovered through its business gateway. Display names cannot reliably identify a provider's source.

## Decision

`DSH-003` adds an optional provider-id filter to the shared model menu directory. Deployment supplies the visible ids; Core owns the common menus and GEA owns the company-client setting. The filter changes presentation while keeping saved selections, the Host catalog and execution authorization intact.

## Alternatives considered

Display-name lists misclassify renamed models. Removing adapters or rewriting user settings would change execution and retained configuration. Replacing the picker would duplicate the shared selection lifecycle.

## Consequences

The default shows every provider. Explicit empty lists produce empty menus. Removed or excluded selections retain their stored intent. Retire this company extension when upstream offers an equivalent deployment filter and the same selection-preservation tests pass.

## Verification

Directory and dual-entry tests cover exact source ids, defaults, empty lists, refresh, selection and retained intent. The Host configuration test covers public injection and disposal. These source tests do not establish installed-client or release acceptance.
