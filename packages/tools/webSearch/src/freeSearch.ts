export type FreeSearchHit = { url: string; title: string; snippet: string };

const searchHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()] ?? " ";
    const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}

function htmlText(value: string) {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function unwrapUrl(value: string) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.searchParams.get("uddg") || url.href;
  } catch {
    return "";
  }
}

async function fetchHtml(url: string, signal: AbortSignal) {
  const response = await fetch(url, { headers: searchHeaders, redirect: "follow", signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  const maxBytes = 1_500_000;
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      chunks.push(size > maxBytes ? chunk.value.subarray(0, chunk.value.byteLength - (size - maxBytes)) : chunk.value);
      if (size > maxBytes) break;
    }
  } finally {
    await reader?.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function takeHits(hits: FreeSearchHit[], maxResults: number) {
  const seen = new Set<string>();
  const sources: FreeSearchHit[] = [];
  for (const hit of hits) {
    if (!hit.url || !hit.title || seen.has(hit.url)) continue;
    seen.add(hit.url);
    sources.push({ url: hit.url, title: hit.title, snippet: hit.snippet });
    if (sources.length >= maxResults) break;
  }
  return sources;
}

function taggedAnchors(html: string, className: string) {
  const pattern = new RegExp(`<a\\b(?=[^>]*\\bclass="[^"]*${className}[^"]*")(?=[^>]*\\bhref="([^"]+)")[^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  return [...html.matchAll(pattern)];
}

function duckDuckGoHits(html: string) {
  const titles = taggedAnchors(html, "result__a");
  const snippets = [...html.matchAll(/<(?:a|td)\b(?=[^>]*\bclass="[^"]*result__snippet[^"]*")[^>]*>([\s\S]*?)<\/(?:a|td)>/gi)];
  return titles.map((match, index) => ({
    url: unwrapUrl(decodeEntities(match[1] ?? "")),
    title: htmlText(match[2] ?? ""),
    snippet: htmlText(snippets[index]?.[1] ?? ""),
  }));
}

function bingHits(html: string) {
  return html.split(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"/i).slice(1).map(block => {
    const link = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    return {
      url: unwrapUrl(decodeEntities(link?.[1] ?? "")),
      title: htmlText(link?.[2] ?? ""),
      snippet: htmlText(snippet?.[1] ?? ""),
    };
  });
}

function errorText(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause && !error.message.includes(cause) ? `${error.message}（${cause}）` : error.message;
}

export async function searchFree(query: string, signal: AbortSignal, maxResults: number) {
  const encoded = encodeURIComponent(query);
  const attempts: { name: "DuckDuckGo" | "Bing"; url: string; parse: (html: string) => FreeSearchHit[] }[] = [
    { name: "DuckDuckGo", url: `https://html.duckduckgo.com/html/?q=${encoded}`, parse: duckDuckGoHits },
    { name: "Bing", url: `https://cn.bing.com/search?q=${encoded}&setlang=zh-Hans&count=${maxResults}`, parse: bingHits },
  ];
  const failures: string[] = [];
  for (const attempt of attempts) {
    signal.throwIfAborted();
    const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
    try {
      const sources = takeHits(attempt.parse(await fetchHtml(attempt.url, attemptSignal)), maxResults);
      if (sources.length) return { engine: attempt.name, sources, failures };
      failures.push(`${attempt.name}没有返回结果`);
    } catch (error) {
      if (signal.aborted) throw error;
      failures.push(`${attempt.name}：${errorText(error)}`);
    }
  }
  throw new Error(failures.join("；"));
}
