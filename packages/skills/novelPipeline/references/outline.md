# 大纲 `bible/outline.md`

可查看、可直接编辑的 Markdown。与 `characters.json` 互链：人物用同一 `id` 或显示名，改角色设定时同步改大纲中对应弧线。

## 推荐结构

```markdown
# 故事大纲

## 来源
- 文件：{source.path}
- 范围：{改编或全本说明}

## 故事核
一句话：谁想要什么，遇到什么阻碍，结果如何。

## 世界观与约束
与 `characters.json` / `style.json` 中的 settingConstraints、artStyle 保持一致。

## 人物弧
| 角色 id | 姓名 | 欲望 | 阻碍 | 变化 |
| --- | --- | --- | --- | --- |
| hero | … | … | … | … |

## 分集索引
与 `episodes.json` 对齐，每集一行：
- ep001 《标题》：章节范围；一句话摘要；状态 draft/confirmed

## 待决问题
用户尚未确认的设定，确认后删除或迁入正文。
```

## 规则

- 阶段 1 至少写出「故事核 + 人物弧」；阶段 2 补全分集索引并与 `episodes.json` 互指。
- 不把完整小说正文贴进 outline；正文留在 `source/` 或用户指定路径。
- 用户在文档面板改 outline 后，Agent 再改 `episodes` / `characters` 前必须先读盘。
