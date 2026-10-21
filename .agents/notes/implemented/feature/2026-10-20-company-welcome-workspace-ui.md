# Agent Note: Company welcome and workspace UI extension points

Status: implemented

English | [中文](2026-10-20-company-welcome-workspace-ui.zh.md)

## Problem

Company welcome copy and a single collapsible workspace heading cannot be expressed through the existing brand-mark slot and fixed workspace heading.

## Decision

`DSH-002` keeps company welcome copy and navigation styling in Workbench. Core provides a blank welcome content slot and optional workspace heading and expansion props. The existing composer, workspace picker, Session browser and persistence remain Core-owned.

## Alternatives considered

Replacing the entire conversation or workspace browser would duplicate unrelated behavior. DOM patches would couple the plugin to private markup. Narrow public UI inputs let the plugin reuse the original components.

## Consequences

An absent contribution retains the original welcome and workspace presentation. Folding keeps the browser state mounted; native search and directory shortcuts request shell expansion. Retire these company inputs if upstream provides equivalent controls and the original behavior tests pass through those controls.

## Verification

Owning component tests cover default welcome fallback, contributed welcome content, workspace row identity across collapse and shortcut expansion requests. Companion plugin tests cover company copy, navigation and composed browser behavior. Source tests do not establish installed-client or release acceptance.
