---
kind: upgrade-guide
description: "Session feedback uses a product submission provider and a server receipt."
---

# Session feedback submission provider

English | [中文](guide.zh.md)

## Change

The Session dialog calls `sessionFeedback.submit` with a required description and displays the returned report number. Message ratings, `/feedback <text>`, and local `sessionFeedback.record` retain their existing behavior. Without a submission provider, the dialog reports unavailability.

## Migration

Mount one product handler through `ctx.sessionFeedback.registerSubmit` in its effect lifecycle. The product owns collection, identity, upload and fixed-snapshot retry. Rebuild `command-feedback` Host reflection, `api-remotes` Client assembly, and `ui-message-feedback` together; replacing only the UI leaves the submission method unavailable.

Validate the actual product dialog and returned receipt after loading the combination. This change does not migrate existing Session events or add an automatic uploader.
