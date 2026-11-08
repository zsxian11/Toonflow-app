# 分集方案 `bible/episodes.json`

## 根对象

```json
{
  "version": 1,
  "confirmed": false,
  "activeEpisodeId": "ep001",
  "defaultVideoProviderId": "comfyui",
  "defaultVideoModelId": "comfyVideo",
  "events": [
    { "id": "e1", "chapter": "第1章", "summary": "事件摘要", "characters": ["hero"] }
  ],
  "episodes": []
}
```

`events` 为切集前的章节事件表，可在确认后保留供复查。

## 单集条目

| 字段 | 说明 |
| --- | --- |
| `id` | 如 `ep001` |
| `title` | 集标题 |
| `chapterRange` | 原文章节或字数区间说明 |
| `eventIds` | 覆盖的事件 id 列表 |
| `summary` | 本集剧情摘要 |
| `targetDurationSec` | 用户确认的目标时长（秒） |
| `segmentCount` | 拆成几段 |
| `maxSegmentSec` | 可选；单段上限，默认按模型能力 |
| `videoProviderId` | 默认 `comfyui` |
| `videoModelId` | 默认 `comfyVideo` |
| `status` | `draft` / `confirmed` / `inProduction` / `done` |

## 阶段 2 执行顺序

1. 读原文与 `characters.json`、`outline.md`。
2. 写 `events[]`（按章/场景），合并到分集草案 `episodes[]`，`status=draft`，`confirmed=false`。
3. 更新 `outline.md`「分集索引」与人物弧互链。
4. 向用户展示分集表（聊天摘要即可，正式数据以 JSON 为准）。
5. **askUser 一次确认当前制作集**（默认 `episodes[0]` 或用户点名的集）：

```json
{
  "title": "确认本集制作参数",
  "question": "请确认当前集的时长、Comfy 视频模型与分段数。跳过不代表已确认。",
  "fields": [
    {
      "field": "episodeId",
      "title": "制作哪一集",
      "type": "select",
      "required": true,
      "options": ["ep001 标题A", "ep002 标题B"]
    },
    {
      "field": "targetDurationSec",
      "title": "本集目标时长（秒）",
      "type": "inputNumber",
      "required": true,
      "placeholder": "例如 60"
    },
    {
      "field": "videoModelId",
      "title": "视频模型（Comfy）",
      "type": "select",
      "required": true,
      "options": ["comfyVideo"]
    },
    {
      "field": "segmentCount",
      "title": "拆成几段",
      "type": "inputNumber",
      "required": true,
      "placeholder": "例如 4"
    }
  ]
}
```

`videoModelId` 的 options 必须来自当前已安装的 `comfyui` 视频模型列表；若列表为空则中止并引导配置 Comfy，不得改填 Seedance。

6. 用户未 skip 时写回：
   - `activeEpisodeId`
   - 对应 episode 的 `targetDurationSec`、`segmentCount`、`videoProviderId=comfyui`、`videoModelId`、`status=confirmed`
   - 根级 `confirmed=true`（表示至少有一集已确认参数）
7. 若 `skipped: true`，保持 draft，不进入分镜生成。

## 切分原则

- 先用 sourceText 的全文目录确定章节总数，再按事件完整性合并或拆开。目录里的每个序号都要出现在某一集的范围内，或单独标为延后；不能只处理开头十余章。
- 摘要用 sourceText 的 excerpt 覆盖对应序号。excerpt 不是正文；制作当前集之前用 read 读完该范围。
- 单集尽量有起承转合；字数过长则拆多集并说明删减或延后。
- 展示分集表后等用户确认，禁止未确认就批量生成视频。
- 后续 `shotSheet` / 视频节点**只读**已确认集的字段，禁止再问第二套冲突的时长/模型/段数。
