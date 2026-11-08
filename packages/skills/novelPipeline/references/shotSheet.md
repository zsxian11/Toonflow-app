# 分镜表 `bible/shotSheet.json`

## 根对象

```json
{
  "version": 1,
  "episodeId": "ep001",
  "videoProviderId": "comfyui",
  "videoModelId": "comfyVideo",
  "targetDurationSec": 60,
  "segmentCount": 4,
  "segmentBudgetSec": 15,
  "shots": []
}
```

根上的 `video*`、`targetDurationSec`、`segmentCount` 必须从已确认的 `episodes.json` 复制；`segmentBudgetSec` 默认 `ceil(targetDurationSec / segmentCount)`，禁止技能自行改成与确认冲突的值。

## 镜头条目

| 字段 | 说明 |
| --- | --- |
| `id` | 如 `s01` |
| `scene` | 场次/环境 |
| `durationSec` | 本段时长 |
| `framing` | 景别 |
| `cameraMove` | 运镜 |
| `transitionIn` / `transitionOut` | 转场 |
| `action` | 画面动作 |
| `dialogue` | 对白，可空 |
| `audio` | 环境声/BGM 要点，可空 |
| `characterIds` | 引用 `characters.json` 的 id |
| `refImagePaths` | 工作区参考图（优先角色 `adoptedImagePaths`） |
| `prompts` | `{ "comfy": "..." }` |
| `canvasNodeId` | 可选；已创建的视频生成节点 id |
| `status` | `draft` / `confirmed` / `generated` |

镜头数量默认等于 `segmentCount`；剧情需要时可略多，但总时长对齐 `targetDurationSec`。

## 阶段 3 执行顺序

1. 读取已确认 `episodes.json` 中的 `activeEpisodeId`（或用户指定集）；未确认则回到阶段 2。
2. 读取本集剧情来源（outline / 事件 / 原文对应章节）与 `characters.json`。
3. 按 [分镜与运镜](shotCraft.md) 起草 `shots[]`（景别、运镜、转场、动作、对白）。
4. 按 [Comfy 视频提示词](comfyVideoPrompt.md) 为每镜渲染 `prompts.comfy`，写入 JSON。
5. askUser 或聊天确认分镜表；用户确认后将镜头 `status` 标为 `confirmed`。
6. 为每镜创建视频生成节点：`providerId/modelId` 用根上确认值；连接角色参考图；`setPrompt` 写入 `prompts.comfy`。记录 `canvasNodeId`。
7. 仅当用户明确要求生成时调用 `generateVideo`。

## 对话优化（补丁协议）

用户说「改 s02 运镜更慢」「把第三段对白改短」时：

1. 先 `workspace` 读当前 `shotSheet.json`。
2. **只修改**点名的 `shotId`（或明确的镜头序号对应 id）的字段与/或 `prompts.comfy`。
3. 重新渲染该镜 `prompts.comfy`（若改了 framing/cameraMove/action/dialogue）。
4. 写回 JSON；若存在 `canvasNodeId`，对该节点 `setPrompt` 同步，不重跑未点名镜头。
5. 禁止：无请求整表重写、改动已确认的 `videoModelId`/`segmentCount`、静默换供应商。

用户在文本节点直改定稿时：把最终文本写回对应 `shots[].prompts.comfy`，再按需 `setPrompt`。

## 与导演台关系

`director3dNode` 仅作难镜头预演可选支线；导出关键帧可写入 `refImagePaths`，不替代 `prompts.comfy` 主链。
