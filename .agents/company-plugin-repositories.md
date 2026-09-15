# 公司插件仓库定位

业务需求先按下表进入所属仓库，读取该仓库的 AGENTS.md 和相关 README，再修改；优先使用 DSH 现有插件扩展点，避免为 GEA 或某个 Agent 修改 DSH 核心。只有确认现有扩展点无法满足需求时，才说明具体缺口并考虑最小通用核心改动。

以下目录均以 `/Users/synear/Documents/ChatGPT/` 为根；GitHub 仓库归属均为 `CleverC2200`。实施前核对实际 remote、分支和未提交改动，不凭目录名判断归属。

| 本地项目 / GitHub 仓库 | 负责的改动 |
| --- | --- |
| `dpherness` / `deepseek-harness` | 官方 DSH 基础能力与上游同步；`origin` 是个人 fork，`upstream` 是 deepseek-ai 官方仓库。 |
| [dsh-gea-plugin](../../dsh-gea-plugin/README.md) / `dsh-gea-plugin` | GEA 登录、组织身份、业务导航、需求预测与销售计划审批页面、业务接口和模型上下文；`desktop/` 负责 GEA Electron 壳、图标、启动、连接设置和安装包。 |
| [dsh-agent-workbench](../../dsh-agent-workbench/README.md) / `dsh-agent-workbench` | 多 Agent 共用布局、业务页面与原生对话并排显示、页面与业务实例的 Session 关联；复用 DSH 原生会话与输入框，不放 GEA 业务规则。 |
| [dsh-plugin-hub](../../dsh-plugin-hub/README.md) / `dsh-plugin-hub` | 公司 DSH 插件目录、插件安装更新界面与执行接入；派生自第三方 dshplugin/dsh-plugin-hub，不是官方插件。 |
| [dsh-agent-manage](../../dsh-agent-manage/README.zh.md) / `dsh-agent-manage` | Agent 资源套件的来源、安装、启用，技能、命令、角色、MCP/LSP 管理与 GEA 登录后的 MCP 接入。 |
| [company-agent-suites](../../company-agent-suites/README.md) / `company-agent-suites` | 公司角色、技能、提示词和命令内容，由 Agent Manage 消费；这是资源套件仓库，不是 DSH 运行时插件。 |

GEA 单向依赖独立工作台，工作台不依赖 GEA；修改公共布局进入工作台，修改具体业务页面进入业务插件。不要在 GEA 中恢复 `packages/agent-workbench` 源码副本。新增带交互页面的 Agent 使用公共工作台接口并拥有自己的业务插件；纯技能、角色或命令内容进入套件仓库。

区分第三方 `dsh-plugin` 插件与官方 `dsh plugin` 命令：后者调用 pnpm 管理 profile 插件。不要把资源套件刷新当作运行时插件升级，也不要把独立仓库等同于已实现桌面外置更新；检查桌面加载目录、版本依赖和重启机制后再承诺更新能力。GitHub 上游同步仅更新 DSH 仓库，不能顺带更改插件依赖锁、桌面运行版本或重打安装包。

`dsh-gea-workbench` 是 GEA 的旧 worktree，`gea-dsh-plugin-prototype` 是 GEA 目录别名，`dsh-gea-cleanup-backup-*` 是备份；不作为独立业务项目，也不在未核实进程和工作区归属时清理。

