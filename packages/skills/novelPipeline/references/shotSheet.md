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
| `characterIds` | 引用 `characters.json` 的基础角色 id（身份列表） |
| `characterStateIds` | 可选；本镜实际外观状态 id：基础用角色 `id`，变体用 `states[].id`；缺省则等同 `characterIds` 基础态 |
| `sceneStateId` | 可选；场景状态资产 id（含时段变体）；缺省用场次默认场景基础图 |
| `propStateIds` | 可选；本镜关键道具状态 id |
| `refImagePaths` | 工作区参考图；须与上述状态的 `adoptedImagePaths` / 采用路径一致，不把基础图冒充变体 |
| `prompts` | `{ "comfy": "..." }` |
| `canvasNodeId` | 可选；已创建的视频生成节点 id |
| `previsStatus` | 可选；难镜预演状态：`skipped`（非难镜或用户跳过）/ `pending`（待预演）/ `ready`（白模已确认并接入） |
| `previsVideoPath` | 可选；工作区内白模预演视频相对路径；`previsStatus=ready` 时应有可读文件 |
| `status` | `draft` / `confirmed` / `generated` |

镜头数量默认等于 `segmentCount`；剧情需要时可略多，但总时长对齐 `targetDurationSec`。

## 阶段 3 执行顺序

1. 读取已确认 `episodes.json` 中的 `activeEpisodeId`（或用户指定集）；未确认则回到阶段 2。
2. 读取本集剧情来源（outline / 事件 / 原文对应章节）与 `characters.json`。
3. 按 [分镜与运镜](shotCraft.md) 起草 `shots[]`（景别、运镜、转场、动作、对白）；按剧情填写 `characterStateIds` / `sceneStateId`（换装、战损、夜景等），并据此填充 `refImagePaths`。
4. 按 [Comfy 视频提示词](comfyVideoPrompt.md) 为每镜渲染 `prompts.comfy`，写入 JSON；提示词中的外观描述与所引状态一致。
5. askUser 或聊天确认分镜表；用户确认后将镜头 `status` 标为 `confirmed`。
6. 为每镜创建视频生成节点：`providerId/modelId` 用根上确认值；**连接本镜状态对应的采用图**（非一律基础三视图）；`setPrompt` 写入 `prompts.comfy`。记录 `canvasNodeId`。
7. 难镜（打斗、追逐、多层空间、严格左右走位）先读取名为 `actionSpace` 的技能做导演台白模；用户确认预演并接好参考视频后，才可在用户明确要求时调用 `generateVideo`。非难镜仅当用户明确要求生成时调用。

### 状态图与战损衔接

- 某镜动作导致持续战损时：该镜 `characterStateIds` 仍可用完好态，并在 `action` / 提示词写清破损发生；**下一镜起**改为战损 `states[].id`，`refImagePaths` 与节点入边同步替换，完好态图不再上传。
- 缺某状态采用图时：该镜标待素材，不把基础图当作变体连入，也不调用受影响镜的 `generateVideo`。

## 对话优化（补丁协议）

用户说「改 s02 运镜更慢」「把第三段对白改短」时：

1. 先 `workspace` 读当前 `shotSheet.json`。
2. **只修改**点名的 `shotId`（或明确的镜头序号对应 id）的字段与/或 `prompts.comfy`。
3. 重新渲染该镜 `prompts.comfy`（若改了 framing/cameraMove/action/dialogue）。
4. 写回 JSON；若存在 `canvasNodeId`，对该节点 `setPrompt` 同步，不重跑未点名镜头。
5. 禁止：无请求整表重写、改动已确认的 `videoModelId`/`segmentCount`、静默换供应商。

用户在文本节点直改定稿时：把最终文本写回对应 `shots[].prompts.comfy`，再按需 `setPrompt`。

## 与导演台 / 白模预演

- 难镜：起草分镜时将 `previsStatus` 设为 `pending`；对应视频生成节点用 `setConfig` 打开 `previsRequired`。`director3dNode` 导出 MP4 后连入该镜视频节点（可先 `setExportTarget` 指定目标，或导出前单选目标节点）；模式须支持参考视频。导出关键帧 PNG 可写入 `refImagePaths`。
- 预演确认并接线后：写 `previsVideoPath`（工作区相对路径）、`previsStatus=ready`；未做难镜的镜头用 `skipped`，不要留空 `pending` 却去生成。
- `prompts.comfy`（或节点 `setPrompt`）仍是主链；预演不替代提示词，须在提示词中写清参考职责。
- 本段上传对照示例（编号以实际入边与 `referenceOrder` 为准）：

```text
本段上传：{{ref 1}}＝白模预演（只锁走位/朝向/时序/跟镜/节奏）；{{ref 2}}＝角色采用图；{{ref 3}}＝场景采用图。
```

白模固定职责声明见 `actionSpace` 技能的 `references/previsDuty.md`。`previsStatus` 为 `pending`、或节点 `previsRequired` 且无参考视频时，不调用 `generateVideo`。
