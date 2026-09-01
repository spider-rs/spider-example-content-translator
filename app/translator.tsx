"use client";

import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import SearchBar from "./searchbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

type OutputFormat = "text" | "markdown" | "raw" | "json";
type TargetLanguage = "en" | "es" | "fr" | "de" | "pt" | "it" | "ja" | "ko" | "zh-CN" | "ar" | "hi" | "ru";

const LANGUAGES: { code: TargetLanguage; label: string }[] = [
  { code: "en", label: "English (Original)" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Russian" },
];

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

function stripHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToMarkdown(html: string): string {
  let md = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, "![]($1)");
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n");
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

function extractStructured(html: string, url: string): object {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const h1s = [...(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [])].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const h2s = [...(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [])].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const links = [...(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) || [])].map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() })).filter((l) => l.href.startsWith("http"));
  const images = [...(html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || [])].map((m) => m[1]);
  const text = stripHTML(html);
  return { url, title, metaDescription: metaDesc, headings: { h1: h1s, h2: h2s }, links: links.slice(0, 100), images: images.slice(0, 50), wordCount: text.split(/\s+/).filter(Boolean).length, textPreview: text.slice(0, 500) };
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function quickHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function splitIntoChunks(text: string, maxBytes = 450): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = "";
  for (const para of paragraphs) {
    const combined = current ? current + "\n\n" + para : para;
    if (new Blob([combined]).size > maxBytes && current) {
      chunks.push(current);
      current = para;
    } else {
      current = combined;
    }
  }
  if (current) chunks.push(current);
  // Split any single chunk still over limit by sentences
  const result: string[] = [];
  for (const chunk of chunks) {
    if (new Blob([chunk]).size <= maxBytes) {
      result.push(chunk);
    } else {
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        const next = buf ? buf + " " + s : s;
        if (new Blob([next]).size > maxBytes && buf) {
          result.push(buf);
          buf = s;
        } else {
          buf = next;
        }
      }
      if (buf) result.push(buf);
    }
  }
  return result.length ? result : [""];
}

async function translateText(text: string, targetCode: string, signal?: AbortSignal): Promise<string> {
  const chunks = splitIntoChunks(text);
  const translated: string[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({ q: chunk, langpair: `en|${targetCode}` });
    const res = await fetch(`${MYMEMORY_URL}?${params}`, { signal });
    if (!res.ok) throw new Error(`Translation API error: ${res.status}`);
    const json = await res.json();
    if (json.responseStatus === 429 || json.responseStatus === 403) {
      throw new Error("Translation quota exceeded — try again later");
    }
    translated.push(json.responseData?.translatedText || chunk);
  }
  return translated.join("\n\n");
}

export default function Translator() {
  const [data, setData] = useState<any[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("text");
  const [copied, setCopied] = useState(false);
  const [targetLang, setTargetLang] = useState<TargetLanguage>("en");
  const [translatedContent, setTranslatedContent] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const pages = (data || []).filter((p: any) => p?.url);
  const current = pages[selectedIdx];

  const converted = useMemo(() => {
    if (!current?.content) return "";
    switch (outputFormat) {
      case "text": return stripHTML(current.content);
      case "markdown": return htmlToMarkdown(current.content);
      case "json": return JSON.stringify(extractStructured(current.content, current.url), null, 2);
      case "raw": return current.content;
    }
  }, [current, outputFormat]);

  const text = useMemo(() => current?.content ? stripHTML(current.content) : "", [current]);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;
  const readingTime = Math.ceil(wordCount / 200);
  const contentSize = current?.content ? new Blob([current.content]).size : 0;

  const editorLang: Record<OutputFormat, string> = { text: "plaintext", markdown: "markdown", json: "json", raw: "html" };

  const isTranslatable = targetLang !== "en" && (outputFormat === "text" || outputFormat === "markdown");

  // Translation effect
  useEffect(() => {
    if (!isTranslatable || !converted) {
      setTranslatedContent("");
      setIsTranslating(false);
      setTranslationError(null);
      return;
    }

    const cacheKey = `${quickHash(converted)}_${targetLang}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setTranslatedContent(cached);
      setIsTranslating(false);
      setTranslationError(null);
      return;
    }

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsTranslating(true);
    setTranslationError(null);

    translateText(converted, targetLang, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          translationCacheRef.current.set(cacheKey, result);
          setTranslatedContent(result);
          setIsTranslating(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIsTranslating(false);
        setTranslationError(err.message);
        toast({ title: "Translation failed", description: err.message, variant: "destructive" });
      });

    return () => controller.abort();
  }, [converted, targetLang, outputFormat, isTranslatable, toast]);

  // Clear translation cache when data changes (new crawl)
  useEffect(() => {
    translationCacheRef.current.clear();
    setTranslatedContent("");
    setTranslationError(null);
  }, [data]);

  const displayContent = useMemo(() => {
    if (!isTranslatable) return converted;
    if (translatedContent) return translatedContent;
    return converted; // fallback during loading or error
  }, [converted, isTranslatable, translatedContent]);

  const langLabel = LANGUAGES.find((l) => l.code === targetLang)?.label || "English";

  const copyContent = () => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadCurrent = () => {
    const exts: Record<OutputFormat, string> = { text: "txt", markdown: "md", json: "json", raw: "html" };
    const slug = current.url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    downloadBlob(displayContent, `${slug}.${exts[outputFormat]}`, "text/plain");
  };

  const downloadAll = () => {
    const ts = new Date().toISOString().slice(0, 10);
    const allConverted = pages.map((p: any) => {
      switch (outputFormat) {
        case "text": return `## ${p.url}\n\n${stripHTML(p.content || "")}\n\n---\n`;
        case "markdown": return `## ${p.url}\n\n${htmlToMarkdown(p.content || "")}\n\n---\n`;
        case "json": return JSON.stringify(extractStructured(p.content || "", p.url));
        case "raw": return `<!-- ${p.url} -->\n${p.content || ""}\n`;
      }
    });
    const ext = outputFormat === "json" ? "json" : outputFormat === "markdown" ? "md" : outputFormat === "raw" ? "html" : "txt";
    const content = outputFormat === "json" ? `[\n${allConverted.join(",\n")}\n]` : allConverted.join("\n\n");
    downloadBlob(content, `translated-${ts}.${ext}`, "text/plain");
  };

  const getTitle = (html: string, url: string): string => {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match?.[1]?.trim() || new URL(url).pathname;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SearchBar setDataValues={setData} />
      {pages.length > 0 && current ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Page List Sidebar */}
          <div className="w-64 border-r flex flex-col shrink-0">
            <div className="px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>{pages.length} page{pages.length !== 1 ? "s" : ""} crawled</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={downloadAll}>
                Export All
              </Button>
            </div>
            <div className="overflow-auto flex-1">
              {pages.map((p: any, i: number) => {
                const title = getTitle(p.content || "", p.url);
                const size = new Blob([p.content || ""]).size;
                const words = stripHTML(p.content || "").split(/\s+/).filter(Boolean).length;
                return (
                  <button
                    key={i}
                    className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/30 transition-colors ${selectedIdx === i ? "bg-muted/50 border-l-2 border-l-[#3bde77]" : ""}`}
                    onClick={() => setSelectedIdx(i)}
                  >
                    <p className="text-xs font-medium truncate">{title}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">{p.url}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{formatSize(size)}</Badge>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{words} words</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 flex-wrap">
              <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
                {(["text", "markdown", "raw", "json"] as OutputFormat[]).map((fmt) => {
                  const labels: Record<OutputFormat, string> = { text: "Text", markdown: "Markdown", raw: "HTML", json: "JSON" };
                  return (
                    <Button
                      key={fmt}
                      size="sm"
                      variant={outputFormat === fmt ? "default" : "ghost"}
                      onClick={() => setOutputFormat(fmt)}
                      className={`text-xs h-7 px-3 rounded-md ${outputFormat === fmt ? "bg-[#3bde77] hover:bg-[#2bc866] text-black" : ""}`}
                    >
                      {labels[fmt]}
                    </Button>
                  );
                })}
              </div>

              <Select value={targetLang} onValueChange={(v) => setTargetLang(v as TargetLanguage)}>
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} className="text-xs">
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isTranslating && (
                <svg className="w-4 h-4 animate-spin text-[#3bde77]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{wordCount.toLocaleString()} words</span>
                <span>{charCount.toLocaleString()} chars</span>
                <span>{readingTime} min read</span>
                <span>{formatSize(contentSize)}</span>
              </div>

              <Button size="sm" variant="outline" className="text-xs h-7" onClick={copyContent}>
                {copied ? (
                  <><svg className="w-3 h-3 mr-1 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copied</>
                ) : (
                  "Copy"
                )}
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={downloadCurrent}>
                Download
              </Button>
            </div>

            {/* Split View: Source + Output */}
            <div className="flex flex-1 overflow-hidden">
              {/* Source HTML */}
              <div className="flex-1 border-r flex flex-col">
                <div className="px-3 py-1.5 bg-muted/30 border-b text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Source HTML
                </div>
                <div className="flex-1">
                  <Suspense fallback={<div className="p-4 text-muted-foreground text-sm">Loading editor...</div>}>
                    <MonacoEditor height="100%" language="html" value={current.content || ""} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }} />
                  </Suspense>
                </div>
              </div>

              {/* Converted Output */}
              <div className="flex-1 flex flex-col">
                <div className="px-3 py-1.5 bg-muted/30 border-b text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <span>
                    {outputFormat === "text" ? "Clean Text" : outputFormat === "markdown" ? "Markdown" : outputFormat === "json" ? "Structured JSON" : "Raw HTML"}
                    {isTranslatable && ` → ${langLabel}`}
                  </span>
                  {isTranslating && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 animate-pulse text-[#3bde77] border-[#3bde77]/40">
                      Translating...
                    </Badge>
                  )}
                  {translationError && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-red-400 border-red-400/40">
                      Error
                    </Badge>
                  )}
                </div>
                <div className="flex-1">
                  <Suspense fallback={<div className="p-4 text-muted-foreground text-sm">Loading editor...</div>}>
                    <MonacoEditor height="100%" language={editorLang[outputFormat]} value={displayContent} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }} />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4">
          <svg
            height={64}
            width={64}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            className="fill-[#3bde77] opacity-30"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M1.5 1.5H7.5V7.5H1.5zM16.5 1.5H22.5V7.5H16.5zM1.5 16.5H7.5V22.5H1.5zM16.5 16.5H22.5V22.5H16.5zM7.5 3H16.5V6H7.5zM3 7.5H6V16.5H3zM7.5 6H8.25L18.75 16.5H16.5V18.75L6 8.25V7.5H7.5z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-muted-foreground">Spider Content Translator</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Crawl any website and convert its content between formats.
            Translate into 12 languages. View source HTML side-by-side
            with clean text, markdown, structured JSON, or raw HTML output.
          </p>
          <div className="flex gap-6 text-xs text-muted-foreground/60 pt-2">
            <span>Clean Text</span>
            <span>Markdown</span>
            <span>Structured JSON</span>
            <span>Raw HTML</span>
            <span>12 Languages</span>
          </div>
        </div>
      )}
    </div>
  );
}
