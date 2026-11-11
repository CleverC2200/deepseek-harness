---
kind: upgrade-guide
description: "会话反馈使用产品提交处理和服务端回执。"
---

# 会话反馈提交处理

[English](guide.md) | 中文

## 变更

会话弹窗用必填描述调用 `sessionFeedback.submit`，显示返回的反馈号。消息评分、`/feedback <text>` 和本地 `sessionFeedback.record` 维持原行为；未注册提交处理时，弹窗显示不可用。

## 迁移

产品在 effect 生命周期内通过 `ctx.sessionFeedback.registerSubmit` 注册唯一处理，负责材料、身份、上传与固定快照重试。需同步构建 `command-feedback` Host 反射、`api-remotes` Client 汇总包和 `ui-message-feedback`；只替换界面会缺少提交方法。

装载组合后验证真实产品弹窗和返回回执。该变更不迁移既有 Session 事件，也不增加自动上传器。
