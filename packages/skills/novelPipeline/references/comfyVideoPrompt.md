# Comfy 视频提示词

`prompts.comfy` 是写入 Comfy 视频工作流正面提示词节点的纯文本，不是 Seedance 专用模板。

## 推荐结构（一段一镜）

```text
{artStyle}，{时长提示}。
场景：{scene}。景别：{framing}。运镜：{cameraMove}。转场：{transitionIn}->{transitionOut}。
画面：{action}。
角色：{角色名与已确认外观锚点，与参考图一致}。
对白/声音：{dialogue}；{audio}。
约束：保持角色与参考图一致；{settingConstraints}；无水印字幕（除非剧情需要）。
```

## 规则

- 绑定真实参考：有采用图时在节点侧连接参考，并在 prompt 中说明「与参考人物一致」，不虚构未上传的图。
- 不输出 JSON、XML 或多段编号清单作为唯一内容；一段镜头对应一个视频节点的一份 prompt。
- 优化时只改用户点名的镜头；保留未提及的运镜与对白。
- 若 Comfy 工作流另有负面词节点，把禁项写入 `style.negativePrompt` 或节点 `other`，不要塞进正面词导致模型忽略。
