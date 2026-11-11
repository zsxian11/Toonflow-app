# 角色圣经 `bible/characters.json`

Agent 与用户共同维护的正式角色表。图片节点提示词与采用结果须与此文件同步。

## 根对象

```json
{
  "version": 1,
  "source": { "path": "小说.txt", "title": "可选标题" },
  "settingConstraints": "时代、世界观、禁忌（如禁止现代服饰）",
  "characters": []
}
```

## 角色条目

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定小驼峰或 slug，跨文件引用 |
| `name` | 显示名 |
| `role` | 身份简述 |
| `importance` | `main` / `supporting` / `extra` |
| `appearance` | 外貌综合描述 |
| `costume` | 常服/关键服饰 |
| `speciesOrAge` | 物种或年龄阶段 |
| `sourceQuotes` | 原文摘句数组；可空 |
| `inferred` | 无原文外貌时为 `true` |
| `settingConstraints` | 覆盖全局约束的角色级补充，可空 |
| `views` | 多视图提示词数组（基础态） |
| `refImagePaths` | 工作区相对路径参考图 |
| `adoptedImagePaths` | 已采用生成图路径（基础态） |
| `states` | 可选；剧情状态变体数组（服饰/战损等），见下表 |

## `views[]`

| 字段 | 说明 |
| --- | --- |
| `key` | `face` / `front` / `side` / `back` / `full`；参考板可用 `sheet` |
| `prompt` | 可直接交给图片生成的完整提示词 |
| `status` | `draft` / `confirmed` / `generated` / `adopted` |

## `states[]`（剧情状态变体）

按已确认分集/大纲提案；瞬时表情不建项。与 production 的状态矩阵同语义。

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定 id，如 `linFengCostumeArena`、`linFengDamageSleeve`；分镜用 `characterStateIds` 引用 |
| `kind` | `costume` / `damage` / `other` |
| `label` | 短名，如「大会服」「袖破战损」 |
| `trigger` | 引发该状态的场次或事件 |
| `prompt` | 以基础采用图为参考的改图/出图提示词；写清不变项与仅改变项 |
| `adoptedImagePaths` | 该状态已采用图；未出图前为空，不得填入基础态路径冒充 |
| `status` | `draft` / `confirmed` / `generated` / `adopted` / `skipped` |

战损版 id 建议与 actionSpace 资产清单对齐（如角色基础 `C001` 对应战损 `C001-D1` 时可在 `label` 或 `id` 中注明）。破损发生的那一段仍可参考完好态；**下一段起**分镜改引战损 `id`，视频节点改连战损采用图。

默认新建角色使用一张 **sheet** 参考板（特写+正侧背同一画），prompt 模板：

```text
{artStyle}角色参考板，同一角色为{name}，{role}，{speciesOrAge}。
外观锚点：{appearance}。服饰：{costume}。
约束：{settingConstraints}。
同一画面横向排列：头部特写、正面完整全身、右侧90°完整全身、背面完整全身。
各视角身份与状态一致，全身尺度一致，不裁切、不重叠。
自然静态姿态，中性表情，简洁背景。无剧情场景、其他角色、水印或尺寸标注。
{有参考图时：使用 {{ref N}} 保持身份，仅调整已确认项。}
```

`artStyle` 来自 `bible/style.json`。

## 抽取规则

- 合并别名到同一 `id`。
- 优先保留影响识别的体型、发型、配色、伤疤、标志物。
- 换装、持续战损影响跨集识别时写入 `states[]`（优先），或另建变体角色；在 outline / 分镜注明适用场次。不把基础 `adoptedImagePaths` 改写成变体图。
