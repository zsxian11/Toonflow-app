import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";

export type ProductionGate = { status: "draft" | "confirmed"; version: number };

export type ProductionAsset = {
  id: string;
  name: string;
  version: number;
  adoptedPath?: string;
  canvasPath?: string;
  nodeId?: string;
  usedBy: string[];
  voicePrompt?: string;
};

export type ProductionSegment = {
  id: string;
  order: number;
  scriptRange?: string;
  dialogue?: string;
  canvasPath?: string;
  nodeId?: string;
  adoptedPath?: string;
  status: "draft" | "generating" | "ready" | "adopted" | "failed";
};

export type ProductionState = {
  version: 1;
  brief: {
    durationSec: number | null;
    ratio: string | null;
    language: string | null;
    style: string | null;
    providerId: string | null;
    modelId: string | null;
  };
  gates: { script: ProductionGate; assets: ProductionGate; generation: ProductionGate };
  characters: ProductionAsset[];
  scenes: ProductionAsset[];
  props: ProductionAsset[];
  episodes: { id: string; title: string; canvasPath: string; segments: ProductionSegment[] }[];
  delivery: { episodeId: string; videoPath: string; srtPath: string; segmentIds: string[] } | null;
};

export function createProductionState(): ProductionState {
  return {
    version: 1,
    brief: { durationSec: null, ratio: null, language: null, style: null, providerId: null, modelId: null },
    gates: {
      script: { status: "draft", version: 1 },
      assets: { status: "draft", version: 1 },
      generation: { status: "draft", version: 1 },
    },
    characters: [],
    scenes: [],
    props: [],
    episodes: [{ id: "ep001", title: "第001集", canvasPath: "画布/分集/第001集.json", segments: [] }],
    delivery: null,
  };
}

async function mkdirIfMissing(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
  try {
    await files.mkdir(path);
  } catch (error) {
    if (!axios.isAxiosError<{ data?: { code?: string } }>(error) || error.response?.status !== 409 || error.response.data.data?.code !== "EEXIST") throw error;
  }
}

export async function createProductionProject(directory: string) {
  const files = useWorkspaceFiles(directory);
  await mkdirIfMissing(files, "画布");
  await mkdirIfMissing(files, "画布/分集");
  await mkdirIfMissing(files, "制作");
  const canvas = { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await files.writeJson("画布/剧本.json", canvas, true);
  await files.writeJson("画布/资产.json", canvas, true);
  await files.writeJson("画布/分集/第001集.json", canvas, true);
  await files.writeJson("制作/state.json", createProductionState(), true);
}
