# Agent Note: Company Core source maintenance

Status: implemented

English | [中文](2026-10-17-company-core-source-maintenance.zh.md)

## Problem

Company desktop requirements sometimes exceed upstream plugin extension points. Those source changes need a durable owner and an explanation that survives upstream upgrades, without putting company change histories in source comments or relying on a particular chat account.

## Decision

This maintenance decision is `DSH-000`. The company maintains Core source in the existing `CleverC2200/deepseek-harness` GitHub fork. `deepseek-ai/deepseek-harness` remains the upstream comparison source. This is the adopted maintenance policy, not a declaration that the pending plugin settings feature is implemented or released. Selecting this fork does not upgrade its default branch or establish its old source as the next product baseline.

Company changes use existing extension points first. A missing extension point is addressed by the smallest coherent Core change, with affected consumers and verification in the same change. Business identity, credentials, authorization and API logs remain owned by GEA; business pages remain owned by Workbench. A Core hook does not move those responsibilities into Core.

The code expresses behavior through names and structure. New company changes do not add explanatory source comments; existing required API contracts are preserved. Commit messages explain the concrete change. The owning Agent Note records its purpose, alternatives, retained responsibility, required verification and conditions for removal. There is no parallel ADR tree or hand-maintained patch copy.

Each independently maintained company difference has a stable identifier such as `DSH-001`. Its owning Agent Note names that identifier; implementation and repair commits include `Company-Change: DSH-001`. Git and the PR retain exact changed files and revisions. Notes do not duplicate code, line numbers or a manually updated list of rebased commit IDs. Identifiers are query aids, not authorization or compatibility checks.

### Baselines and upgrades

Before implementation, the task freezes its actual official repository, release ref and full commit ID separately from the company source revision. Existing task integration manifests remain authoritative for their candidates; this policy does not create a competing global baseline register. The final build receipt records the official baseline, actual company source revision, relevant plugin versions, artifact digests and verification evidence outside the source commit that it identifies.

An upstream upgrade uses an isolated candidate, carries only still-required company changes, and compares the old and new commit series with `git range-diff`. Behavior tests and actual installed-artifact checks remain separate evidence. Published source refs keep their targets. When upstream covers a company requirement, its original acceptance conditions are checked before the duplicate implementation is removed; the owning note records the replacement and removal reason.

A source revert does not restore or downgrade Session data, drafts, presets or persistent formats. Data compatibility has its own verification. The protected official checkout and current production client are not development targets; releases and business writes retain their separate authorization.

### Querying a difference

```sh
git log --all --grep='Company-Change: DSH-001'
git diff <official-base> <company-source> --stat
git range-diff <old-base>..<old-source> <new-base>..<new-source>
```

These commands describe Git queries, not evidence that an upgrade or product acceptance has run. `range-diff` supports human review and does not replace tests.

## Alternatives considered

**Source comments as a change ledger.** Rejected because they intermingle current behavior with company change history and enlarge the source context needed for ordinary work.

**A second patch queue or bundle string replacements.** Rejected as the maintenance authority because it duplicates the source difference and separates reviewed source from executed code. A delivery patch can be exported from a fixed Git base when needed.

**A separate decision directory or personal chat memory.** Rejected as the primary record because this fork already owns Agent Notes, and maintainers need the decision alongside the code regardless of account or chat history.

## Consequences

Company Core has one source owner, and future changes can be compared with a frozen upstream base and traced to a durable reason. Maintainers keep the owning note current when realization changes and preserve superseded decisions according to the existing Agent Note lifecycle. This adds focused record keeping and upstream adaptation work; it does not establish a new governance service or change the existing release checks.

## Deferred

Plugin updates and settings navigation remain separate implementation work. The accepted UI boundary keeps the complete official plugin order, layout, icons and top refresh/add controls. Official plugins stay above installed plugins. Only installed-plugin update information and actions are extended. Plugin management moves from the main sidebar to the last settings entry; the existing GEA API log page also receives a settings entry. No source patch, runtime acceptance or client publication for those features is included in this policy record.
