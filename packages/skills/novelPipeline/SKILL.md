---
name: novelPipeline
description: 以 ComfyUI 为默认图视频后端，把小说或剧本做成可审阅的 bible 状态与画布资产。仅当用户明确点名本技能时使用；默认制作请使用 production。明确只要讨论文字或编辑本技能时不启动制作。
disable-model-invocation: true
metadata:
  version: "1.1.0"
  displayName: 小说制片（Comfy）
  author: Toonflow
  github: https://github.com/HBAI-Ltd/Toonflow-app
---

# 小说制片流水线（Comfy 为主）

自动制作已改走 production。只有用户点名本技能时才执行。

把小说或剧本落成工作区 `bible/` 结构化文件，再用画布节点经 **ComfyUI** 出图/出视频。默认媒体模型供应商为 `comfyui`；未配置时停止并请用户到「设置 → 媒体模型 → ComfyUI」填写 `baseUrl` 与 API 工作流，**不得静默改用 Seedance 或其他云厂商**。

本技能不沿用主 `workflow` 的 Seedance 路由锁存。需要镜头知识时读取本包 [分镜与运镜](references/shotCraft.md) 与 [Comfy 视频提示词](references/comfyVideoPrompt.md)。

## 工作区约定

所有正式状态写在项目工作区，不用聊天摘要代替：

```text
bible/
  outline.md
  characters.json
  style.json
  episodes.json
  shotSheet.json
```

schema、示例与字段说明：

- [角色圣经](references/characters.md) · [示例](references/examples/characters.example.json)
- [大纲](references/outline.md)
- [分集方案](references/episodes.md) · [示例](references/examples/episodes.example.json)
- [分镜表](references/shotSheet.md) · [示例](references/examples/shotSheet.example.json)
- [画风与 Comfy 默认](references/style.md)

修改前先用 workspace 工具读取现有文件；写回用完整 JSON/Markdown 覆盖。目录不存在时先创建 `bible/`。字段形状以 references 与 examples 为准。

## 主流程与确认关口

| 步骤 | 阶段 | 动作 | 落盘 | 确认 |
| --- | --- | --- | --- | --- |
| 0 | 1 | 确认原文路径；用 sourceText 扫完全文目录 | 可选 `source/` | 仅缺路径时问一次 |
| 1 | 1 | 抽核心人物与世界观；写多视图 prompt | `characters.json`、`outline.md` | askUser：勾选出图角色 + 画风 |
| 2 | 1 | 写 `style.json`；建图片生成节点并出图 | 画布节点 | Comfy `characterSheet`/`imageGen` |
| 3 | 2 | 事件表 → 分集草案；强化大纲互链 | `episodes.json`、`outline.md` | askUser 三元组：时长/模型/段数 |
| 4 | 3 | 写镜头表与 Comfy 提示词 | `shotSheet.json` | 确认后再灌视频节点 |
| 5 | 3 | 创建视频节点、写入 prompt、按需生成 | 画布 | 用户明确要求才 `generateVideo` |

每步顺序：**读已确认输入 → 完成本步 → 写盘 → 回读检查 → 展示 → 等待确认**。跳过须有用户明确选择；`askUser` 返回 `skipped: true` 不视为确认。

---

## 阶段 1：角色圣经 + Comfy 出图

### 步骤 1：阅读小说 → 角色

1. 用 `sourceText`（action=index）扫描用户指定的小说/剧本，直到 `nextCursor` 为空。这是全文目录。禁止用 `read` 通读原文：`read` 单次约 50KB，长篇会停在开头十余章。角色外貌只摘已经 `read` 过的章节；目录里还没读的章节不能当成“没有其他主角”。人物表写明已读序号范围。
2. 只保留可出场、需要视觉形象的角色；纯画外音可记入 outline，不强制出图。
3. 按 [角色圣经](references/characters.md) 写 `characters.json`：原文外貌句进 `sourceQuotes`；无描写则合理补全并标 `inferred: true`。
4. 为每个角色生成 `views[]`（默认 `sheet` 参考板 prompt，同一身份一致）。
5. 按 [大纲](references/outline.md) 写极简 `outline.md`（故事核、人物弧；角色 id 与 JSON 一致）。
6. **一次** askUser，例如：

```json
{
  "title": "确认角色出图",
  "question": "勾选需要生成参考板的角色，并指定统一画风。",
  "fields": [
    {
      "field": "characterIds",
      "title": "出图角色",
      "type": "checkbox",
      "required": true,
      "options": ["linFeng 林风", "other 配角名"]
    },
    {
      "field": "artStyle",
      "title": "统一画风",
      "type": "input",
      "required": true,
      "placeholder": "如：国风写实插画"
    }
  ]
}
```

结果写入 `style.json` 的 `artStyle`，并过滤后续出图列表。

### 步骤 2：Comfy 出角色图

1. 查询图片模型；优先 `providerId=comfyui` 且 `modelId=characterSheet`（若无则 `imageGen`）。没有 Comfy 模型则报错并引导配置，不换供应商。
2. 每个勾选角色一个图片生成节点；`setPrompt` 使用该角色参考板 prompt（含画风与 `settingConstraints`）。
3. 需要多候选时，`setConfig` 写入 `n`（1–16）；生成后用 `listImageResults` / `adoptImageResult` 或请用户在节点上采用。
4. 参考板可用宫格切分；采用路径回写 `characters[].adoptedImagePaths`。
5. 润色或按参考图调整：先改 `characters.json` 的 `views[].prompt` / `refImagePaths`，再 `setPrompt` 并重新生成。
6. **剧情状态变体**（服饰/战损等）：分集或大纲已确认后，按 [角色圣经](references/characters.md) 的 `states[]` 提案清单，用户确认后再出图；采用路径写入对应 `states[].adoptedImagePaths`，不覆盖基础态。细则与 production 状态矩阵同语义。

---

## 阶段 2：分集确认 + 大纲互链

完整字段与 askUser 表单见 [分集方案](references/episodes.md)。

1. 基于全文目录写 `events[]` 与分集草案，更新 `outline.md` 分集索引。每一章都要落入某一集，或明确标为延后/不制作；可以写成章节范围。禁止只保留目录开头的若干章。写某一集摘要时用 `sourceText` action=excerpt 覆盖该集序号；进入分镜前改用 action=read 读完该集正文。返回 `nextFrom` 就继续，不能把本批当成范围结尾。
2. 展示草案后，用 askUser **一次**确认：制作集、`targetDurationSec`、`videoModelId`（仅 comfyui 视频模型）、`segmentCount`。
3. 写回 `episodes.json`（`confirmed`、`activeEpisodeId`、对应集 `status=confirmed`）。
4. 未确认不得进入阶段 3 生成；后续只读已确认参数。

---

## 阶段 3：大师分镜 → Comfy 提示词

完整字段与补丁协议见 [分镜表](references/shotSheet.md)。

1. 从已确认集复制模型与时长预算到 `shotSheet.json` 根字段。
2. 按 [shotCraft](references/shotCraft.md) 写镜头，填 `characterStateIds` / `sceneStateId` 等状态映射；按 [comfyVideoPrompt](references/comfyVideoPrompt.md) 渲染每镜 `prompts.comfy`，`refImagePaths` 对齐状态采用图。
3. 用户确认后建视频节点，连接**本镜状态图**并 `setPrompt`；明确要求生成时才 `generateVideo`。战损镜之后下一段改连战损状态图。
4. **对话优化**：只补丁点名的 `shotId`，写回 JSON 并同步对应节点；禁止整表重写或改确认过的模型/段数。

---

## 工具与依赖

- workspace：读写 `bible/`；原文用 sourceText 扫描目录并按章读取，不用 read 通读长篇
- askUser：确认关口（fields 最多 12；跳过≠确认）
- canvas / nodeTools：建节点、`setConfig`/`setPrompt`/`generateImage`/`generateVideo`、`listImageResults`/`adoptImageResult`
- 不调用会改用非 Comfy 默认路由的其他制片技能作为主链

## 交付话术

向用户报告时引用真实文件路径与节点 id；说明哪些是原文锚点、哪些是推断；Comfy 未就绪时只给配置步骤，不假装已生成。
