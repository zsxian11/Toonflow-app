import { z } from "zod";
import type { ToolDefinition, ToolFiles } from "@toonflow/tools-scaffold/runtime";

const maxFileBytes = 32 * 1024 * 1024;
const catalogBudget = 48 * 1024;
const windowChars = 6000;
const requestSchema = z.object({
  action: z.enum(["index", "excerpt", "read"]).describe("index 扫描全文目录；excerpt 按章返回开头和结尾；read 按章返回正文"),
  path: z.string().min(1).max(4096).describe("工作区内的小说或剧本文本路径"),
  cursor: z.number().int().min(1).optional().describe("index 续读目录的起始序号，从 1 开始"),
  from: z.number().int().min(1).optional().describe("excerpt/read 的起始序号，从 1 开始"),
  to: z.number().int().min(1).optional().describe("excerpt/read 的结束序号，包含该序号"),
  offset: z.number().int().min(0).optional().describe("read 从起始章节正文的第几个字继续，从 0 开始"),
  maxChars: z.number().int().min(500).max(16000).optional().describe("excerpt/read 本次返回的字数上限"),
}).strict();

const headingPattern = /^(?:第[0-9０-９零一二三四五六七八九十百千万两〇○]+[章节回部集卷篇]|序章|楔子|前言|序言|引子|尾声|终章|后记|番外(?:[0-9０-９零一二三四五六七八九十]+)?)(?:[：:、.．\s].*)?$/u;
const englishHeadingPattern = /^chapter\s+\d+\b.*$/i;

export type SourceSection = { n: number; title: string; line: number; chars: number; body: string };
export type SourceScan = { mode: "chapter" | "window"; chars: number; sections: SourceSection[] };

function decodeSource(bytes: Uint8Array) {
  try {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("binary");
    return text.replace(/^\uFEFF/, "");
  } catch {
    throw new Error("无法读取文本：仅支持 UTF-8 或带 BOM 的 UTF-16 编码，请转换编码后重试");
  }
}

function isHeading(line: string) {
  const title = line.trim();
  return title.length > 0 && title.length <= 80 && (headingPattern.test(title) || englishHeadingPattern.test(title));
}

export function scanSourceText(text: string): SourceScan {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  const headings: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (isHeading(lines[index]!)) headings.push(index);
  }
  const sections: SourceSection[] = [];
  if (headings.length >= 2) {
    const preamble = lines.slice(0, headings[0]).join("\n").trim();
    if (preamble.length >= 400) {
      sections.push({ n: 1, title: "开篇", line: 1, chars: preamble.length, body: preamble });
    }
    for (let index = 0; index < headings.length; index++) {
      const start = headings[index]!;
      const end = index + 1 < headings.length ? headings[index + 1]! : lines.length;
      const title = lines[start]!.trim();
      const body = lines.slice(start + 1, end).join("\n").trim();
      sections.push({ n: sections.length + 1, title, line: start + 1, chars: title.length + body.length, body });
    }
    return { mode: "chapter", chars: normalized.length, sections };
  }
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + windowChars);
    if (end < normalized.length) {
      const breakAt = normalized.lastIndexOf("\n", end);
      if (breakAt > start + Math.floor(windowChars / 2)) end = breakAt + 1;
    }
    const body = normalized.slice(start, end).trim();
    const line = normalized.slice(0, start).split("\n").length;
    sections.push({ n: sections.length + 1, title: `片段${sections.length + 1}`, line, chars: body.length, body });
    start = end;
  }
  if (!sections.length) sections.push({ n: 1, title: "全文", line: 1, chars: 0, body: "" });
  return { mode: "window", chars: normalized.length, sections };
}

function packRows(header: string, rows: string[], start: number) {
  let text = header;
  let index = start;
  for (; index < rows.length; index++) {
    const next = `${text}${rows[index]}\n`;
    if (Buffer.byteLength(next) > catalogBudget && index > start) break;
    text = next;
  }
  return { text: text.trimEnd(), next: index < rows.length ? index + 1 : undefined };
}

function renderIndex(scan: SourceScan, cursor: number) {
  const unit = scan.mode === "chapter" ? "章" : "段";
  const start = Math.min(Math.max(cursor, 1), scan.sections.length + 1);
  const header = [
    `全文已扫描，共 ${scan.sections.length} ${unit}，${scan.chars} 字。`,
    scan.mode === "chapter"
      ? "序号是扫描顺序，标题中的章回数字可能不连续。这是全文目录，不是文件开头的截断。"
      : "没有识别到足够的章节标题，已按约 6000 字切段。这是全文切段，不是文件开头的截断。",
    "目录出现“目录未完”时，继续 sourceText，action=index，cursor 用给出的序号。目录未完时不要拆分，也不要声称已经读完。",
    "序号\t标题\t起始行\t字数",
    "",
  ].join("\n");
  const rows = scan.sections.slice(start - 1).map(section => `${section.n}\t${section.title}\t${section.line}\t${section.chars}`);
  const packed = packRows(header, rows, 0);
  const nextCursor = packed.next === undefined ? undefined : start + packed.next - 1;
  const note = nextCursor
    ? `\n\n目录未完：已给出序号 ${start}–${nextCursor - 1}，全文共 ${scan.sections.length} ${unit}。请继续 sourceText，action=index，cursor=${nextCursor}。`
    : `\n\n目录已完整，共 ${scan.sections.length} ${unit}。nextCursor 为空。`;
  return {
    text: `${packed.text}${note}`,
    details: { mode: scan.mode, total: scan.sections.length, chars: scan.chars, from: start, to: nextCursor ? nextCursor - 1 : scan.sections.length, nextCursor: nextCursor ?? null },
  };
}

function clip(text: string, maxChars: number) {
  const flat = text.replace(/\s+/g, "");
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars)}…`;
}

function renderExcerpt(scan: SourceScan, from: number, to: number, maxChars: number) {
  const unit = scan.mode === "chapter" ? "章" : "段";
  const parts: string[] = [];
  let used = 0;
  let end = from - 1;
  for (let index = from - 1; index < to; index++) {
    const section = scan.sections[index]!;
    const opening = clip(section.body, 180);
    const closing = section.body.replace(/\s+/g, "").length > 260 ? clip(section.body.slice(-120), 80) : "";
    const block = `${section.n}. ${section.title}\n开头：${opening || "（无正文）"}${closing ? `\n结尾：${closing}` : ""}`;
    if (parts.length && used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
    end = section.n;
    if (used >= maxChars) break;
  }
  const next = end < to ? end + 1 : undefined;
  const header = `摘录序号 ${from}–${end}，全文共 ${scan.sections.length} ${unit}。摘录只有开头和结尾，不是正文。`;
  const tail = next
    ? `摘录未完。请继续 sourceText，action=excerpt，from=${next}，to=${to}。未覆盖的${unit}不能写入已完成的拆分。`
    : `本范围摘录已完整。`;
  return {
    text: `${header}\n\n${parts.join("\n\n")}\n\n${tail}`,
    details: { mode: scan.mode, total: scan.sections.length, from, to: end, nextFrom: next ?? null },
  };
}

function renderRead(scan: SourceScan, from: number, to: number, offset: number, maxChars: number) {
  const unit = scan.mode === "chapter" ? "章" : "段";
  const section = scan.sections[from - 1]!;
  if (offset > section.body.length) throw new Error(`offset 超出第 ${from} ${unit}的长度 ${section.body.length}`);
  const parts: string[] = [];
  let remaining = maxChars;
  let end = from;
  let nextOffset = 0;
  let finished = false;
  for (let index = from - 1; index < to; index++) {
    const current = scan.sections[index]!;
    const body = index === from - 1 ? current.body.slice(offset) : current.body;
    const prefix = index === from - 1 && offset > 0 ? `（从第 ${offset} 字继续）\n` : "";
    const block = `## ${current.n}. ${current.title}\n${prefix}${body}`;
    if (block.length > remaining) {
      const slice = body.slice(0, Math.max(0, remaining - prefix.length - current.title.length - 8));
      if (slice.length || parts.length === 0) {
        parts.push(`## ${current.n}. ${current.title}\n${prefix}${slice}`);
        nextOffset = (index === from - 1 ? offset : 0) + slice.length;
        end = current.n;
      }
      finished = false;
      break;
    }
    parts.push(block);
    remaining -= block.length;
    end = current.n;
    nextOffset = 0;
    finished = index === to - 1;
  }
  const next = finished ? undefined : nextOffset > 0 ? { from: end, offset: nextOffset } : { from: end + 1, offset: 0 };
  const header = `正文序号 ${from}–${end}，全文共 ${scan.sections.length} ${unit}。`;
  const tail = next
    ? `正文未完。请继续 sourceText，action=read，from=${next.from}，offset=${next.offset}${to !== scan.sections.length ? `，to=${to}` : ""}。`
    : "本范围正文已完整。";
  return {
    text: `${header}\n\n${parts.join("\n\n")}\n\n${tail}`,
    details: { mode: scan.mode, total: scan.sections.length, from, to: end, nextFrom: next?.from ?? null, nextOffset: next?.offset ?? null },
  };
}

export function createSourceTextTool(files: ToolFiles): ToolDefinition {
  return {
    name: "sourceText",
    label: "扫描长文",
    description: "扫描工作区内的小说或剧本，返回全文目录，并按章节读取摘录或正文。一次正文有字数上限；目录和续读标记给出全文章节数，不把文件开头当成全书。",
    promptSnippet: "用 sourceText 扫描长篇小说或剧本的全文目录，再按章读取。",
    promptGuidelines: [
      "小说、剧本和超过约 50KB 的故事文本先用 sourceText，action=index。目录返回 nextCursor 时继续同一路径，直到 nextCursor 为空。不要用 read 的第一次截断当作全文。",
      "拆分、分集或章节事件必须覆盖目录中的全部序号。可以合并成章节范围，不能只保留开头若干章。用户明确限定范围时，范围外的序号标为延后，不能从结果里消失。",
      "写摘要用 action=excerpt；写正式剧本、分镜或需要原文措辞时用 action=read。返回 nextFrom 时从该序号继续，读完约定范围再下结论。",
    ],
    parameters: z.toJSONSchema(requestSchema, { io: "input", target: "draft-07" }),
    async execute(_id, params, signal) {
      signal?.throwIfAborted();
      const request = requestSchema.parse(params);
      const info = await files.stat(request.path, true);
      if (!info.isFile()) throw new Error("请指定工作区内的文本文件");
      if (info.size > maxFileBytes) throw new Error("文本超过 32MB，请先拆成较小文件再扫描");
      const bytes = await files.readFile(request.path, true, { signal });
      signal?.throwIfAborted();
      const scan = scanSourceText(decodeSource(bytes));
      const total = scan.sections.length;
      if (request.action === "index") {
        const rendered = renderIndex(scan, request.cursor ?? 1);
        return { content: [{ type: "text", text: rendered.text }], details: rendered.details };
      }
      const from = request.from ?? 0;
      if (!from) throw new Error("excerpt 和 read 需要提供 from 起始序号");
      if (from > total) throw new Error(`起始序号超出范围，全文共 ${total} ${scan.mode === "chapter" ? "章" : "段"}`);
      const to = Math.min(request.to ?? total, total);
      if (to < from) throw new Error("结束序号不能小于起始序号");
      const rendered = request.action === "excerpt"
        ? renderExcerpt(scan, from, to, request.maxChars ?? 6000)
        : renderRead(scan, from, to, request.offset ?? 0, request.maxChars ?? 8000);
      signal?.throwIfAborted();
      return { content: [{ type: "text", text: rendered.text }], details: rendered.details };
    },
  };
}
