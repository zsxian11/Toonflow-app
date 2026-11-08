const rules = [
  {
    type: "input",
    field: "baseUrl" as const,
    title: "服务地址",
    value: "http://127.0.0.1:8188",
    props: { placeholder: "http://127.0.0.1:8188" },
    validate: [{ required: true, message: "请填写 ComfyUI 服务地址" }],
  },
  {
    type: "input",
    field: "authToken" as const,
    title: "Bearer Token（可选）",
    value: "",
    props: { type: "password", showPassword: true, autocomplete: "off", placeholder: "本地无鉴权请留空" },
  },
  {
    type: "input",
    field: "characterWorkflow" as const,
    title: "角色参考板 API 工作流 JSON",
    value: "",
    props: { type: "textarea", rows: 6, placeholder: "可选；留空则角色模型复用下方通用图片工作流" },
  },
  {
    type: "input",
    field: "imageWorkflow" as const,
    title: "通用图片 API 工作流 JSON",
    value: "",
    props: { type: "textarea", rows: 6, placeholder: "从 ComfyUI 导出「工作流（API）」粘贴到此处" },
    validate: [{ required: true, message: "请粘贴图片 API 工作流 JSON" }],
  },
  {
    type: "input",
    field: "videoWorkflow" as const,
    title: "视频 API 工作流 JSON",
    value: "",
    props: { type: "textarea", rows: 6, placeholder: "可选；不填则无法生成视频" },
  },
  {
    type: "input",
    field: "promptNodeId" as const,
    title: "正面提示词节点 ID",
    value: "",
    props: { placeholder: "如 6" },
    validate: [{ required: true, message: "请填写正面提示词节点 ID" }],
  },
  {
    type: "input",
    field: "promptInputName" as const,
    title: "提示词输入字段名",
    value: "text",
    props: { placeholder: "text 或 prompt" },
  },
  {
    type: "input",
    field: "negativePromptNodeId" as const,
    title: "负面提示词节点 ID",
    value: "",
    props: { placeholder: "可选" },
  },
  {
    type: "input",
    field: "negativePromptInputName" as const,
    title: "负面词输入字段名",
    value: "text",
    props: { placeholder: "text" },
  },
  {
    type: "input",
    field: "imageNodeId" as const,
    title: "参考图 LoadImage 节点 ID",
    value: "",
    props: { placeholder: "可选；单图参考时使用" },
  },
  {
    type: "input",
    field: "imageInputName" as const,
    title: "参考图输入字段名",
    value: "image",
    props: { placeholder: "image" },
  },
  {
    type: "input",
    field: "seedNodeId" as const,
    title: "种子节点 ID",
    value: "",
    props: { placeholder: "可选" },
  },
  {
    type: "input",
    field: "seedInputName" as const,
    title: "种子字段名",
    value: "seed",
    props: { placeholder: "seed" },
  },
  {
    type: "input",
    field: "batchNodeId" as const,
    title: "批量数量节点 ID",
    value: "",
    props: { placeholder: "可选；对应 batch_size / amount" },
  },
  {
    type: "input",
    field: "batchInputName" as const,
    title: "批量字段名",
    value: "batch_size",
    props: { placeholder: "batch_size 或 amount" },
  },
] as const;

const version = "2.0.1";

type WorkflowGraph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

type ComfyTaskData = {
  kind: "comfy";
  mediaType: "image" | "video";
  promptId: string;
  baseUrlHash: string;
  deadline: number;
};

function wait(signal: AbortSignal, ms: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function baseUrlOf(config: { baseUrl?: string }) {
  const baseUrl = config.baseUrl?.trim();
  if (!baseUrl) throw new Error("请填写 ComfyUI 服务地址");
  return baseUrl.replace(/\/$/, "");
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  const key = authToken?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function parseWorkflow(raw: string, label: string): WorkflowGraph {
  const text = raw?.trim();
  if (!text) throw new Error(`请配置${label} API 工作流 JSON`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label}工作流不是合法 JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label}工作流须为 API 格式对象（节点 id 为键）`);
  const graph = parsed as WorkflowGraph;
  const sample = Object.values(graph)[0];
  if (sample && typeof sample === "object" && "nodes" in (parsed as object)) {
    throw new Error(`${label}工作流看起来是编辑器保存格式，请改用「导出（API）」`);
  }
  return graph;
}

function setNodeInput(graph: WorkflowGraph, nodeId: string, inputName: string, value: unknown, label: string) {
  const id = nodeId.trim();
  if (!id) return;
  const node = graph[id];
  if (!node || typeof node !== "object") throw new Error(`${label}节点 ${id} 不在工作流中`);
  node.inputs ??= {};
  node.inputs[inputName.trim() || "text"] = value;
}

function cloneWorkflow(graph: WorkflowGraph) {
  return JSON.parse(JSON.stringify(graph)) as WorkflowGraph;
}

async function mediaBytes(context: ProviderContext, input: MediaInput, signal: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  if (input.type === "binary") {
    return { bytes: input.data, mimeType: input.mimeType || "application/octet-stream", name: input.name || "upload.bin" };
  }
  if (input.type === "base64") {
    const data = input.data.includes(",") ? input.data.slice(input.data.indexOf(",") + 1) : input.data;
    return { bytes: Buffer.from(data, "base64"), mimeType: input.mimeType || "application/octet-stream", name: input.name || "upload.bin" };
  }
  const response = await context.tool.fetch(input.url, { signal });
  if (!response.ok) throw new Error(`下载参考媒体失败：HTTP ${response.status}`);
  const mimeType = input.mimeType || response.headers.get("content-type") || "application/octet-stream";
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType, name: input.name || "upload.bin" };
}

function extensionOf(mimeType: string, fallback: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return fallback;
}

async function uploadImage(context: ProviderContext, baseUrl: string, apiKey: string | undefined, input: MediaInput, signal: AbortSignal) {
  const { bytes, mimeType } = await mediaBytes(context, input, signal);
  const fileName = `toonflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensionOf(mimeType, "png")}`;
  const boundary = `----ToonflowComfy${Date.now().toString(16)}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([header, Buffer.from(bytes), footer]);
  const response = await context.tool.fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    headers: { ...authHeaders(apiKey), "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
    signal,
  });
  if (!response.ok) throw new Error(`上传参考图失败：HTTP ${response.status}`);
  const data = await response.json() as { name?: string };
  if (typeof data.name !== "string" || !data.name) throw new Error("上传参考图未返回文件名");
  return data.name;
}

function collectOutputs(history: Record<string, unknown>, mediaType: "image" | "video") {
  const outputs = history.outputs;
  if (!outputs || typeof outputs !== "object") return [] as { filename: string; subfolder: string; type: string }[];
  const files: { filename: string; subfolder: string; type: string }[] = [];
  for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
    if (!nodeOutput || typeof nodeOutput !== "object") continue;
    const record = nodeOutput as Record<string, unknown>;
    const images = Array.isArray(record.images) ? record.images : [];
    const gifs = Array.isArray(record.gifs) ? record.gifs : [];
    const videos = Array.isArray(record.videos) ? record.videos : [];
    const list = mediaType === "video" ? [...videos, ...gifs, ...images] : images;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const file = item as { filename?: string; subfolder?: string; type?: string };
      if (typeof file.filename === "string" && file.filename) {
        files.push({ filename: file.filename, subfolder: typeof file.subfolder === "string" ? file.subfolder : "", type: typeof file.type === "string" ? file.type : "output" });
      }
    }
  }
  return files;
}

async function downloadView(
  context: ProviderContext,
  baseUrl: string,
  apiKey: string | undefined,
  file: { filename: string; subfolder: string; type: string },
  mediaType: "image" | "video",
  signal: AbortSignal,
): Promise<MediaAsset> {
  const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
  const response = await context.tool.fetch(`${baseUrl}/view?${params}`, { headers: authHeaders(apiKey), signal });
  if (!response.ok) throw new Error(`下载生成结果失败：HTTP ${response.status}`);
  const mimeType = response.headers.get("content-type") || (mediaType === "video" ? "video/mp4" : "image/png");
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.byteLength) throw new Error("生成结果为空");
  return { mediaType, type: "binary", data, mimeType, name: file.filename };
}

async function pollHistory(
  context: ProviderContext,
  baseUrl: string,
  apiKey: string | undefined,
  promptId: string,
  mediaType: "image" | "video",
  signal: AbortSignal,
): Promise<MediaAsset[]> {
  while (true) {
    signal.throwIfAborted();
    const response = await context.tool.fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
      headers: authHeaders(apiKey),
      signal,
    });
    if (!response.ok) throw new Error(`查询 Comfy 任务失败：HTTP ${response.status}`);
    const data = await response.json() as Record<string, unknown>;
    const entry = data[promptId];
    if (entry && typeof entry === "object") {
      const status = (entry as { status?: { status_str?: string; completed?: boolean; messages?: unknown[] } }).status;
      const failed = status?.status_str === "error" || status?.completed === false && Array.isArray(status.messages)
        && status.messages.some(item => Array.isArray(item) && item[0] === "execution_error");
      if (failed) {
        throw Object.assign(new Error(context.tool.errorMessage?.(entry) || "ComfyUI 工作流执行失败"), { code: "MEDIA_TASK_FAILED" });
      }
      const files = collectOutputs(entry as Record<string, unknown>, mediaType);
      if (files.length) {
        const assets: MediaAsset[] = [];
        for (const file of files) assets.push(await downloadView(context, baseUrl, apiKey, file, mediaType, signal));
        return assets;
      }
      if (status?.completed === true) throw new Error("ComfyUI 任务完成但未找到输出文件，请检查工作流输出节点");
    }
    await wait(signal, 2000);
  }
}

function imageWorkflowRaw(config: ProviderConfig<typeof rules>, modelId: string) {
  if (modelId === "characterSheet" && config.characterWorkflow?.trim()) return config.characterWorkflow;
  return config.imageWorkflow;
}

async function runWorkflow(
  context: ProviderContext,
  config: ProviderConfig<typeof rules>,
  mediaType: "image" | "video",
  request: ImageRequest | VideoRequest,
): Promise<MediaAsset[]> {
  const baseUrl = baseUrlOf(config);
  const apiKey = config.authToken;
  const workflowRaw = mediaType === "video" ? config.videoWorkflow : imageWorkflowRaw(config, request.model);
  const graph = cloneWorkflow(parseWorkflow(workflowRaw, mediaType === "video" ? "视频" : "图片"));
  const promptField = config.promptInputName?.trim() || "text";
  setNodeInput(graph, config.promptNodeId, promptField, request.prompt, "正面提示词");
  const negative = typeof request.other?.negativePrompt === "string" ? request.other.negativePrompt : "";
  if (config.negativePromptNodeId?.trim() && negative) {
    setNodeInput(graph, config.negativePromptNodeId, config.negativePromptInputName?.trim() || "text", negative, "负面提示词");
  }
  const images = "images" in request ? request.images : undefined;
  const firstFrame = "firstFrame" in request ? request.firstFrame : undefined;
  const reference = firstFrame || images?.[0];
  if (reference && config.imageNodeId?.trim()) {
    const uploaded = await uploadImage(context, baseUrl, apiKey, reference, context.signal ?? AbortSignal.timeout(120_000));
    setNodeInput(graph, config.imageNodeId, config.imageInputName?.trim() || "image", uploaded, "参考图");
  }
  if (config.seedNodeId?.trim()) {
    const seed = typeof request.other?.seed === "number" && Number.isFinite(request.other.seed)
      ? Math.trunc(request.other.seed)
      : Math.floor(Math.random() * 1_000_000_000);
    setNodeInput(graph, config.seedNodeId, config.seedInputName?.trim() || "seed", seed, "种子");
  }
  const count = mediaType === "image"
    ? (typeof (request as ImageRequest).n === "number" && (request as ImageRequest).n! > 0
      ? Math.min(16, Math.trunc((request as ImageRequest).n!))
      : typeof request.other?.n === "number" && request.other.n > 0 ? Math.min(16, Math.trunc(request.other.n)) : undefined)
    : undefined;
  if (count && config.batchNodeId?.trim()) {
    setNodeInput(graph, config.batchNodeId, config.batchInputName?.trim() || "batch_size", count, "批量数量");
  }

  const deadline = Date.now() + 30 * 60_000;
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const submit = await context.tool.fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph }),
    signal,
  });
  if (!submit.ok) {
    const detail = context.tool.errorMessage?.(await submit.text().catch(() => "")) || `HTTP ${submit.status}`;
    throw new Error(`提交 ComfyUI 任务失败：${detail}`);
  }
  const submitData = await submit.json() as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (submitData.error || submitData.node_errors && Object.keys(submitData.node_errors as object).length) {
    throw new Error(context.tool.errorMessage?.(submitData) || "ComfyUI 拒绝了工作流");
  }
  const promptId = submitData.prompt_id;
  if (typeof promptId !== "string" || !promptId) throw new Error("ComfyUI 未返回 prompt_id");
  await context.saveTaskData?.({
    kind: "comfy",
    mediaType,
    promptId,
    baseUrlHash: String(context.tool.hash(baseUrl)),
    deadline,
  } satisfies ComfyTaskData);
  return pollHistory(context, baseUrl, apiKey, promptId, mediaType, signal);
}

export default {
  id: "comfyui",
  label: "ComfyUI",
  version,
  readme: `连接本地或云端 ComfyUI 标准 HTTP API（/prompt、/history、/view、/upload/image）。
在 ComfyUI 中导出「工作流（API）」JSON：通用图片必填；角色参考板可选（留空则复用通用图片工作流）；视频可选。
填写正面提示词等节点 ID。服务端须能访问 baseUrl；浏览器本机的 localhost 仅当 Toonflow 服务也在同一台机器时有效。
无鉴权请留空 Bearer Token。`,
  rules,
  models: [
    {
      id: "characterSheet",
      label: "角色参考板（图片）",
      type: "image",
      mode: ["text", "singleImage"],
      imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      imageSizes: ["1K", "2K"],
    },
    {
      id: "imageGen",
      label: "通用图片",
      type: "image",
      mode: ["text", "singleImage"],
      imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      imageSizes: ["1K", "2K"],
    },
    {
      id: "comfyVideo",
      label: "Comfy 视频",
      type: "video",
      mode: ["text", "singleImage", "startFrameOptional"],
      durationResolutionMap: [{ duration: [4, 5, 6, 8, 10, 12, 15], resolution: ["720p", "1080p"] }],
    },
  ] satisfies ProviderModel[],
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    return runWorkflow(this, this.config, "image", request);
  },
  async generateVideo(request: VideoRequest): Promise<MediaAsset[]> {
    if (!this.config.videoWorkflow?.trim()) throw new Error("请先配置视频 API 工作流 JSON");
    return runWorkflow(this, this.config, "video", request);
  },
  async resumeTask(data: ProviderTaskData): Promise<MediaAsset[]> {
    const baseUrl = baseUrlOf(this.config);
    if (data.kind !== "comfy" || (data.mediaType !== "image" && data.mediaType !== "video")
      || typeof data.promptId !== "string" || !data.promptId
      || data.baseUrlHash !== String(this.tool.hash(baseUrl))
      || typeof data.deadline !== "number" || !Number.isFinite(data.deadline)) {
      throw new Error("Comfy 任务恢复数据无效或服务地址已变更");
    }
    const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(this.signal ? [this.signal] : [])]);
    return pollHistory(this, baseUrl, this.config.authToken, data.promptId, data.mediaType, signal);
  },
} satisfies ProviderDefinition<typeof rules>;
