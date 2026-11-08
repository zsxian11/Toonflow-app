# 画风与 Comfy 默认 `bible/style.json`

```json
{
  "version": 1,
  "artStyle": "例如：国风写实插画、赛博朋克厚涂",
  "negativePrompt": "可选，写入 Comfy 负面词节点时使用",
  "imageProviderId": "comfyui",
  "imageModelId": "characterSheet",
  "videoProviderId": "comfyui",
  "videoModelId": "comfyVideo",
  "preferredEpisodeId": ""
}
```

- 用户在角色确认关口选定的画风写入 `artStyle`。
- 媒体默认供应商/模型必须指向 Comfy；用户显式改成其他供应商时，尊重该选择并写回本文件；本技能启动时若文件仍指向非 Comfy 且用户未改口，应提醒并优先建议 Comfy。
- `negativePrompt` 供 Comfy 适配器 `other.negativePrompt` 或配置映射使用。
