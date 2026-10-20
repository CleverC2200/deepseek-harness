# Agent Note: Company welcome and workspace UI extension points

Status: implemented

English | [中文](2026-10-20-company-welcome-workspace-ui.zh.md)

## Decision

`DSH-002` keeps company welcome copy and navigation styling in Workbench. Core provides a blank welcome content slot and optional workspace heading and expansion props. The existing composer, workspace picker, Session browser and persistence remain Core-owned. An absent contribution retains the original welcome and workspace presentation.

The prior brand-mark slot cannot replace the headline or preview badge. Replacing the entire conversation or workspace browser would duplicate unrelated behavior; DOM patches would couple the plugin to private markup. Narrow public UI inputs let the plugin reuse the original components and keep their state mounted when collapsed.

## Verification and retirement

Owning component tests cover default welcome fallback, contributed welcome content and workspace row identity across collapse. Companion plugin tests cover company copy, navigation and composed browser behavior. Source tests do not establish installed-client or release acceptance. Retire these company inputs if upstream provides equivalent controls and the original behavior tests pass through those controls.
