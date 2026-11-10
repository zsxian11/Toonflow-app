import { mkdir, rm, stat, writeFile } from "@toonflow/file";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { createWorkspaceFfmpeg } from "@/utils/ffmpeg";
import { resolveWorkspacePath } from "@/utils/workspace/files";

export type ExportClip = { path: string; dialogue?: string };

function episodeStem(name?: string) {
  const stem = (name?.trim() || "第001集").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 80);
  if (!stem || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) return "第001集";
  return stem;
}

function srtTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function concatEntry(absolutePath: string) {
  return `file '${absolutePath.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
}

async function unusedRelative(cwd: string, stem: string, extension: string) {
  for (let index = 1; index < 100; index += 1) {
    const relativePath = `成片/${stem}${index === 1 ? "" : `-${index}`}${extension}`;
    const { path } = await resolveWorkspacePath(cwd, relativePath, true);
    const existing = await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!existing) return relativePath;
  }
  throw Object.assign(new Error("成片目录里的同名文件已用完，请整理后再导出"), { status: 409 });
}

function probeDuration(ffmpeg: Awaited<ReturnType<typeof createWorkspaceFfmpeg>>, file: string, signal: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => reject(signal.reason ?? new Error("导出已取消"));
    signal.addEventListener("abort", abort, { once: true });
    ffmpeg.ffprobe(file, (error: Error | null, data: { format?: { duration?: number } }) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) { abort(); return; }
      if (error) reject(error);
      else resolve(typeof data?.format?.duration === "number" ? data.format.duration : 0);
    });
  });
}

function concatCopy(ffmpeg: Awaited<ReturnType<typeof createWorkspaceFfmpeg>>, listPath: string, output: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg().input(listPath).inputOptions(["-f", "concat", "-safe", "0"]).outputOptions(["-c", "copy"]).output(output);
    const abort = () => command.kill("SIGKILL");
    signal.addEventListener("abort", abort, { once: true });
    command.on("error", (error: Error) => {
      signal.removeEventListener("abort", abort);
      reject(signal.aborted ? signal.reason ?? error : error);
    }).on("end", () => {
      signal.removeEventListener("abort", abort);
      resolve();
    }).run();
  });
}

export async function exportEpisode(cwd: string, clips: ExportClip[], episode: string | undefined, signal: AbortSignal) {
  signal.throwIfAborted();
  const files = [];
  for (const clip of clips) {
    const resolved = await resolveWorkspacePath(cwd, clip.path);
    const info = await stat(resolved.path);
    if (!info.isFile()) throw Object.assign(new Error("导出片段必须是视频文件"), { status: 400 });
    files.push({ path: clip.path.replaceAll("\\", "/"), absolute: resolved.path, dialogue: clip.dialogue?.replace(/\r/g, "").trim() ?? "" });
  }
  const ffmpeg = await createWorkspaceFfmpeg(cwd, signal);
  const durations: number[] = [];
  for (const file of files) {
    const duration = await probeDuration(ffmpeg, file.path, signal);
    if (!Number.isFinite(duration) || duration <= 0) throw Object.assign(new Error(`无法读取视频时长：${file.path}`), { status: 422 });
    durations.push(duration);
  }
  const outputDirectory = await resolveWorkspacePath(cwd, "成片", true);
  await mkdir(outputDirectory.path, { recursive: true });
  const stem = episodeStem(episode);
  const videoPath = await unusedRelative(cwd, stem, ".mp4");
  const srtPath = videoPath.replace(/\.mp4$/, ".srt");
  const listPath = `成片/.concat-${randomUUID()}.txt`;
  const list = await resolveWorkspacePath(cwd, listPath, true);
  const video = await resolveWorkspacePath(cwd, videoPath, true);
  await mkdir(dirname(list.path), { recursive: true });
  await writeFile(list.path, files.map(file => concatEntry(file.absolute)).join("\n"), { flag: "wx", signal });
  try {
    signal.throwIfAborted();
    await concatCopy(ffmpeg, listPath, videoPath, signal);
  } catch (error) {
    await rm(video.path, { force: true }).catch(() => {});
    const coded = error as { code?: string; status?: number };
    if (signal.aborted || coded?.code === "FFMPEG_REQUIRED") throw error;
    console.warn("成片拼接失败", error instanceof Error ? error.message : error);
    throw Object.assign(new Error("片段无法直接拼接，请确认它们都是可读且编码一致的视频"), { status: 422 });
  } finally {
    await rm(list.path, { force: true }).catch(() => {});
  }
  let start = 0;
  const cues = files.flatMap((file, index) => {
    const end = start + durations[index]!;
    const cue = file.dialogue ? { start, end, text: file.dialogue } : null;
    start = end;
    return cue ? [cue] : [];
  });
  const srt = cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n");
  const subtitle = await resolveWorkspacePath(cwd, srtPath, true);
  await writeFile(subtitle.path, srt, { flag: "wx", signal });
  return { videoPath, srtPath };
}
