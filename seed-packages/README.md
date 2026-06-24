# JoyHub 官方 Skill 种子包

全部来自 **官方 GitHub 仓库**，可直接上传 JoyHub。已去掉之前自建的周报/会议纪要等包。

**目录**：`skillhub/seed-packages/official/`

## 推荐先传（用量高 + 和你们场景相关）

| 压缩包 | 官方来源 | 热度 / 说明 |
|--------|----------|-------------|
| `react-best-practices.zip` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | skills.sh 前端类 Top，~49 万+ 安装 |
| `web-design-guidelines.zip` | 同上 | UI/无障碍审查，~40 万+ 安装 |
| `composition-patterns.zip` | 同上 | React 组合模式 |
| `internal-comms.zip` | [anthropics/skills](https://github.com/anthropics/skills) | 内部沟通（3P、newsletter 等） |
| `doc-coauthoring.zip` | 同上 | 协作文档写作流程 |
| `frontend-design.zip` | 同上 | 前端页面设计规范 |
| `lark-doc.zip` | [larksuite/cli](https://github.com/larksuite/cli) | 飞书官方，文档类安装量最高之一 |
| `lark-im.zip` | 同上 | 飞书消息/群聊 |
| `lark-base.zip` | 同上 | 飞书多维表格 |
| `lark-workflow-standup-report.zip` | 同上 | 站会日报工作流 |
| `lark-workflow-meeting-summary.zip` | 同上 | 会议纪要工作流 |

## 可选（OpenAI 官方安全类）

| 压缩包 | 官方来源 | 说明 |
|--------|----------|------|
| `security-best-practices.zip` | [openai/skills](https://github.com/openai/skills) | 安全编码最佳实践 |
| `security-threat-model.zip` | 同上 | 威胁建模 |
| `brand-guidelines.zip` | [anthropics/skills](https://github.com/anthropics/skills) | 品牌规范（偏 Anthropic 品牌） |

## 上传

1. JoyHub → 发布 Skill → 选 **Joy 公共库**
2. 上传 `official/*.zip`
3. 建议 slug：`global/react-best-practices`、`global/lark-doc` 等

## 说明

- **飞书 lark-* skill** 是指引 Agent 使用 `lark-cli` 的 Markdown，和你们 Hermes 内置 `feishu_*` 工具是两条路；可同时存在，Agent 按场景选。
- **未包含** Anthropic 的 `docx/xlsx/pdf` 等包：官方版带大量 Python 脚本，不是纯文本；若要可以再说，单独打一包。
- 包内均为 **md / txt / json** 等文本，无 `bin/`、无可执行二进制。
