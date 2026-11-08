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
| `views` | 多视图提示词数组 |
| `refImagePaths` | 工作区相对路径参考图 |
| `adoptedImagePaths` | 已采用生成图路径 |

## `views[]`

| 字段 | 说明 |
| --- | --- |
| `key` | `face` / `front` / `side` / `back` / `full`；参考板可用 `sheet` |
| `prompt` | 可直接交给图片生成的完整提示词 |
| `status` | `draft` / `confirmed` / `generated` / `adopted` |

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
- 换装影响跨集识别时另建变体角色或在 `views` 增加服装态，并在 outline 注明。
