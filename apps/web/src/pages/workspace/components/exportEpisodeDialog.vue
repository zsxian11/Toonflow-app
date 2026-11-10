<template>
  <el-dialog v-model="visible" title="导出本集" width="min(520px, calc(100vw - 32px))" alignCenter appendToBody @open="load">
    <p v-if="message" class="exportMessage" role="status">{{ message }}</p>
    <template v-else>
      <el-select v-if="episodes.length > 1" v-model="episodeId" class="episodeSelect" aria-label="选择集数">
        <el-option v-for="episode in episodes" :key="episode.id" :label="episode.title" :value="episode.id" />
      </el-select>
      <ol v-if="segments.length" class="segmentList">
        <li v-for="(segment, index) in segments" :key="segment.id" class="segmentItem">
          <span class="segmentTitle">{{ segment.scriptRange || segment.dialogue || segment.id }}</span>
          <span class="segmentActions">
            <el-button text :disabled="exporting || index === 0" aria-label="上移" @click="moveSegment(index, -1)">上移</el-button>
            <el-button text :disabled="exporting || index === segments.length - 1" aria-label="下移" @click="moveSegment(index, 1)">下移</el-button>
          </span>
        </li>
      </ol>
      <p v-else class="exportMessage">这一集还没有已采用的视频。请先在制作记录里把片段标为采用。</p>
    </template>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="exporting" :disabled="!!message || !segments.length" @click="exportEpisode">导出 mp4</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { CanvasContext } from "@toonflow/tool-canvas/runtime";
import http from "@/lib/http";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";
import { createProductionState, type ProductionSegment, type ProductionState } from "../productionState";

const visible = defineModel<boolean>({ required: true });
const getCanvas = inject<() => CanvasContext | undefined>("canvas");
const activateCanvas = inject<() => Promise<void> | void>("activateCanvasPanel");
const workspaceStore = useWorkspaceStore();
const message = ref("");
const exporting = ref(false);
const state = ref<ProductionState>(createProductionState());
const episodeId = ref("");
const segmentOrder = ref<ProductionSegment[]>([]);

const episodes = computed(() => state.value.episodes.filter(episode => episode.segments.some(segment => segment.status === "adopted" && segment.adoptedPath)));
const selectedEpisode = computed(() => state.value.episodes.find(episode => episode.id === episodeId.value) ?? episodes.value[0]);
const segments = computed(() => segmentOrder.value);

function adoptedSegments(episode = selectedEpisode.value) {
  return [...(episode?.segments ?? [])].filter(segment => segment.status === "adopted" && segment.adoptedPath).sort((left, right) => left.order - right.order);
}

function load() {
  message.value = "";
  exporting.value = false;
  const directory = workspaceStore.project?.directory;
  if (!directory) { message.value = "请先打开项目"; return; }
  void useWorkspaceFiles(directory).readJson<ProductionState>("制作/state.json").then(value => {
    if (!value || value.version !== 1 || !Array.isArray(value.episodes)) { message.value = "制作记录无法读取"; return; }
    state.value = value;
    episodeId.value = episodes.value[0]?.id ?? "";
    segmentOrder.value = adoptedSegments();
  }).catch(() => { message.value = "还没有制作记录。请先完成剧本、资产和片段选用。"; });
}

watch(episodeId, () => { segmentOrder.value = adoptedSegments(); });

function moveSegment(index: number, offset: number) {
  const next = index + offset;
  const items = [...segmentOrder.value];
  const current = items[index];
  const target = items[next];
  if (!current || !target) return;
  items[index] = target;
  items[next] = current;
  segmentOrder.value = items;
}

async function attachVideo(canvasPath: string, label: string, path: string) {
  await activateCanvas?.();
  const current = getCanvas?.();
  if (!current) return "成片已保存。当前画布还没打开，没有放入视频节点。";
  await current.call({ name: "switchCanvas", args: { canvasId: canvasPath } });
  const canvas = getCanvas?.();
  if (!canvas) return "成片已保存。切换画布后没有放入视频节点。";
  const created = await canvas.call({ name: "addNode", args: { type: "remote-videoNode", position: { x: 80, y: 80 }, label } }) as { node?: { id?: string } };
  const nodeId = created.node?.id;
  if (!nodeId) return "成片已保存。没有创建视频节点。";
  try {
    await canvas.call({ name: "nodeTools", args: { nodeId, name: "node:setVideo", args: { path, mimeType: "video/mp4" } } });
  } catch (error) {
    return error instanceof Error ? `成片已保存。视频节点没有挂上这个文件：${error.message}` : "成片已保存。视频节点没有挂上这个文件。";
  }
  return "";
}

async function exportEpisode() {
  const directory = workspaceStore.project?.directory;
  const episode = selectedEpisode.value;
  if (!directory || !episode || !segments.value.length || exporting.value) return;
  exporting.value = true;
  try {
    const result = await http<{ videoPath: string; srtPath: string }>({
      method: "POST", url: "/api/production/export", timeout: 600000,
      data: {
        directory, episode: episode.title,
        clips: segments.value.map(segment => ({ path: segment.adoptedPath, ...(segment.dialogue ? { dialogue: segment.dialogue } : {}) })),
      },
    });
    const files = useWorkspaceFiles(directory);
    const latest = await files.readJson<ProductionState>("制作/state.json").catch(() => state.value);
    const record = latest?.version === 1 && Array.isArray(latest.episodes) ? latest : state.value;
    record.delivery = { episodeId: episode.id, videoPath: result.videoPath, srtPath: result.srtPath, segmentIds: segments.value.map(segment => segment.id) };
    await files.writeJson("制作/state.json", record);
    const warning = episode.canvasPath ? await attachVideo(episode.canvasPath, `${episode.title}成片`, result.videoPath).catch(error => error instanceof Error ? error.message : "成片已保存，视频节点没有创建") : "";
    if (warning) ElMessage.warning(warning);
    else ElMessage.success(`已导出 ${result.videoPath}`);
    visible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "导出失败");
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped lang="scss">
.exportMessage {
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.episodeSelect {
  width: 100%;
  margin-bottom: 12px;
}

.segmentList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  .segmentItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;

    .segmentTitle {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .segmentActions {
      display: flex;
      flex: none;
    }
  }
}
</style>
