---
name: production
description: 把一句话、小说或已有剧本做成可审阅的剧本、资产、分段视频，并在用户选用后导出一集 mp4。用于开工、续作、改角色或改片段；只要对话文字、或讨论技能本身时不启动制作。
metadata:
  version: "1.0.0"
  displayName: 出片
  author: Toonflow
  github: https://github.com/HBAI-Ltd/Toonflow-app
---

# 出片

这是默认制作路径。Seedance、Comfy、Wan 和其他视频模型只是节点里已经配置的选项，不单独开工，也不追问某一家的版本号。用户点名其他技能时才改走那条路径。

每次推进前先读 `制作/state.json`。没有这个文件时，只补缺失的画布和这份状态，不移动用户已有的 `画布1.json`。写回用完整 JSON 覆盖，然后再读一次。聊天摘要不能代替文件和画布。

## 项目位置

```text
画布/剧本.json
画布/资产.json
画布/分集/第001集.json
制作/state.json
成片/
```

`addCanvas` 可以带 `directory`，例如 `{ "name": "剧本", "directory": "画布" }`。目录不存在时工具会逐级创建。已有画布在错误位置时用 `moveCanvas`，用返回的新画布 ID，不要叫用户手动移动。跨画布不能连边。分集里要引用资产时，在本集放图片节点，指向 `state.json` 里的采用路径。

## 状态文件

`version` 固定为 `1`。字段：

- `brief`：`durationSec`、`ratio`、`language`、`style`，以及视频 `providerId`、`modelId`。未知用 `null`。
- `gates.script`、`gates.assets`、`gates.generation`：`status` 为 `draft` 或 `confirmed`，并有整数 `version`。
- `characters`、`scenes`、`props`：`id`、`name`、`version`、`adoptedPath`、`canvasPath`、`nodeId`、`usedBy`（片段 id）。角色可有一句 `voicePrompt`，不建音色库。
- `episodes[]`：`id`、`title`、`canvasPath`、`segments[]`。片段含 `id`、`order`、`scriptRange`、`dialogue`、`canvasPath`、`nodeId`、`adoptedPath`、`status`。`status` 只使用 `draft`、`generating`、`ready`、`adopted`、`failed`。
- `delivery`：尚无成片时为 `null`。导出成功后写 `episodeId`、`videoPath`、`srtPath`、`segmentIds`。没有这些真实文件，不能把交付说成已出片。

剧本确认不等于允许出图。资产采用不等于允许出视频。同一批生成只确认一次；改模型、改数量或改提示词后重跑，才再问。

换一张采用图时只增加该资产的 `version`，并把 `usedBy` 里状态为 `adopted` 的片段改成 `ready`。保留旧视频，不自动重生成。

## 顺序

1. 看输入是一句话、小说，还是已有剧本。时长、画幅、语言、画风缺了就合并问一次，能从内容判断的不要问。模型先读 `制作/state.json` 的 `brief`；为空时读视频节点 `node:getConfig`，沿用用户已选的模型。用户没选时，用列表里第一个满足当前参考方式的模型，把 `providerId` 和 `modelId` 写进 `brief`。没有视频模型就说明去设置里添加，不改口要求某一种后端。
2. 剧本写入 `画布/剧本.json` 的文本节点。用户确认后把 `gates.script` 设为 `confirmed` 并增加 `version`。
3. 从已确认剧本提取角色、场景、道具，写入 `画布/资产.json` 并出图。确认采用的图写回对应资产的 `adoptedPath`，然后把 `gates.assets` 设为 `confirmed`。
4. 本集片段写入 `画布/分集/第001集.json`。一个片段一个视频节点，提示词只用 `node:setPrompt`。长剧本和分镜表不要连到生成节点，相连文字会被整段追加进提示词。
5. 生成前展示对象、数量、模型、时长、画幅、提示词、参考和费用。费用以视频节点已有报价为准，没有报价就写「算力消耗未知」。用户确认这一批后，把 `gates.generation` 设为 `confirmed`，再调用生成。
6. `{{ref N}}` 按该节点真实入边和 `data.referenceOrder` 编号。编号对不上就停，不猜。
7. 用户选用后，把片段 `status` 写成 `adopted`，并填写 `adoptedPath`。导出使用工作区里的「导出本集」，不要把两段视频的链接叫成片。

## 生成任务

`node:getGenerationStatus` 返回 `idle` 时仍要读 `task`。有未结束、或已成功但还没应用到节点的任务，只复查，不重新提交。关掉画布或搬走画布文件不会取消服务端任务；重新打开后按原来的 `taskId` 恢复。不要因为状态暂时是空闲就再生成一次。
