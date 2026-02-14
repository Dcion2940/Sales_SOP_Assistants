import { ChatHistory, SOPSection, PendingSOP } from "../types";
import { CHAT_API_BASE, SOP_API_BASE, RUNTIME_DEBUG_ENABLED, isWebhookBase } from './apiConfig';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const getChatEndpoints = (): string[] => {
  const base = trimTrailingSlash(CHAT_API_BASE);
  const apiRoute = `${base}/api/chat`;

  if (/\/webhook(\/|$)/i.test(base)) {
    // Prefer backend-style route first; some deployments expose richer payload on /api/chat
    return [apiRoute, base];
  }

  return [apiRoute, base];
};


const isWebhookEndpoint = (endpoint: string): boolean => isWebhookBase(endpoint);

const parseResponseBody = async (response: Response): Promise<{ raw: string; parsed: unknown }> => {
  const raw = await response.text();
  return { raw, parsed: parseJsonIfString(raw) };
};

const postChatPayload = async (
  endpoint: string,
  payload: { conversationId: string; userInput: string; history: ChatHistory[] }
): Promise<Response> => {
  // Use JSON for backend-style /api/chat routes (needed by Express json parser),
  // and fallback to simple request for raw webhook endpoints to reduce preflight risk.
  const isApiChatRoute = /\/api\/chat(\?|$)/i.test(endpoint);

  if (isApiChatRoute || !isWebhookEndpoint(endpoint)) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  return fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

type BackendChatPayload = {
  text?: unknown;
  imageUrls?: unknown;
  image_urls?: unknown;
  images?: unknown;
  imageUrl?: unknown;
  image_url?: unknown;
  image?: unknown;
  images_url?: unknown;
  attachments?: unknown;
  attachmentUrls?: unknown;
  media?: unknown;
  output?: unknown;
  data?: unknown;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseJsonIfString = (payload: unknown): unknown => {
  if (!isNonEmptyString(payload)) return payload;

  const trimmed = payload.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return payload;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return payload;
  }
};

const normalizeImageUrls = (imageUrls: unknown): string[] => {
  const parsed = parseJsonIfString(imageUrls);

  const collectUrls = (value: unknown): string[] => {
    if (!value) return [];

    if (Array.isArray(value)) return value.flatMap(collectUrls);

    if (typeof value === 'object') {
      const obj = value as any;
      // common formats: { url }, { imageUrl }, { image_url: { url } }, { imageUrl: { url } }
      return collectUrls(
        obj.url ??
        obj.src ??
        obj.imageUrl ??
        obj.image_url ??
        obj.image_url?.url ??
        obj.imageUrl?.url ??
        obj.imageUrls ??
        obj.image_urls ??
        obj.images ??
        obj.image ??
        obj.images_url ??
        obj.attachmentUrls ??
        obj.attachments ??
        obj.media ??
        obj.href ??
        []
      );
    }

    if (typeof value === 'string') return [value];

    return [];
  };

  const toAbsoluteIfRelative = (url: string): string => {
    const trimmed = url.trim();

    if (
      /^(https?:)?\/\//.test(trimmed) ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }

    try {
      const origin = trimTrailingSlash(CHAT_API_BASE);
      return new URL(trimmed, `${origin}/`).toString();
    } catch {
      return trimmed;
    }
  };

  return Array.from(
    new Set(
      collectUrls(parsed)
        .filter(isNonEmptyString)
        .map(toAbsoluteIfRelative)
        .filter(isNonEmptyString)
    )
  );
};

const extractImageUrlsFromText = (text: string): string[] => {
  if (!isNonEmptyString(text)) return [];

  const urls = text.match(/https?:\/\/[^\s)\]\">]+/gi) || [];
  return urls.filter((url) => !/\.(js|css|map|json|pdf|txt)(\?|#|$)/i.test(url));
};

const flattenObjects = (input: unknown): Record<string, unknown>[] => {
  const queue: unknown[] = [parseJsonIfString(input)];
  const objects: Record<string, unknown>[] = [];

  while (queue.length > 0) {
    const current = parseJsonIfString(queue.shift());

    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      objects.push(obj);
      queue.push(...Object.values(obj));
    }
  }

  return objects;
};



const toPayloadObject = (value: unknown): BackendChatPayload | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return value as BackendChatPayload;
};


const pickTextFromObject = (obj: Record<string, unknown>): string | undefined => {
  const candidates = [obj.text, obj.message, obj.answer, obj.content, obj.outputText];
  return candidates.find(isNonEmptyString) as string | undefined;
};

const normalizeChatPayload = (payload: unknown): { text: string; imageUrls: string[] } => {
  const parsedPayload = parseJsonIfString(payload);

  const rootPayload = Array.isArray(parsedPayload)
    ? toPayloadObject(parsedPayload[0])
    : toPayloadObject(parsedPayload);

  const nestedPayload = toPayloadObject(parseJsonIfString(rootPayload?.output ?? rootPayload?.data));
  const finalPayload = nestedPayload || rootPayload;

  if (!finalPayload) {
    return { text: '', imageUrls: [] };
  }

  const imageUrls = normalizeImageUrls(finalPayload.imageUrls);
  const snakeCaseImageUrls = normalizeImageUrls(finalPayload.image_urls);
  const images = normalizeImageUrls(finalPayload.images);
  const singleImageUrls = normalizeImageUrls(finalPayload.imageUrl);
  const snakeCaseSingleImage = normalizeImageUrls(finalPayload.image_url);
  const legacyImage = normalizeImageUrls(finalPayload.image);
  const attachments = normalizeImageUrls(finalPayload.attachments);
  const attachmentUrls = normalizeImageUrls(finalPayload.attachmentUrls);
  const media = normalizeImageUrls(finalPayload.media);
  const text = isNonEmptyString(finalPayload.text) ? finalPayload.text.trim() : '';

  // Fallback for n8n/custom payloads where text/image fields are nested deeply.
  const flattenedObjects = flattenObjects(parsedPayload);
  const fallbackText = flattenedObjects
    .map((obj) => pickTextFromObject(obj))
    .find(isNonEmptyString);
  const nestedImageUrls = flattenedObjects.flatMap((obj) =>
    normalizeImageUrls(
      obj.imageUrls ?? obj.image_urls ?? obj.images ?? obj.imageUrl ?? obj.image_url ?? obj.image ?? obj.attachments ?? obj.attachmentUrls ?? obj.media ?? obj.images_url
    )
  );

  const resolvedText = text || (isNonEmptyString(fallbackText) ? fallbackText.trim() : '');

  return {
    text: resolvedText,
    imageUrls: Array.from(
      new Set([
        ...imageUrls,
        ...snakeCaseImageUrls,
        ...images,
        ...singleImageUrls,
        ...snakeCaseSingleImage,
        ...legacyImage,
        ...attachments,
        ...attachmentUrls,
        ...media,
        ...nestedImageUrls
      ])
    )
  };
};

type ChatResponseCandidate = {
  endpoint: string;
  rawResponse: string;
  normalized: { text: string; imageUrls: string[] };
};

export async function sendMessageToBot(
  userInput: string,
  history: ChatHistory[],
  systemInstruction: string,
  _sopKnowledge: SOPSection[],
  conversationId: string
): Promise<{ text: string; imageUrls: string[]; debugInfo?: { endpoint?: string; rawResponse?: string; normalizedImageUrls?: string[]; imageUrlEchoText?: string; probeReport?: string } }> {
  try {
    const candidates: ChatResponseCandidate[] = [];
    const probeRows: string[] = [];
    let resolvedEndpoint: string | undefined;
    let lastError: unknown = null;

    for (const endpoint of getChatEndpoints()) {
      try {
        const response = await postChatPayload(endpoint, {
          conversationId,
          userInput,
          history
        });

        if (!response.ok) {
          lastError = new Error(`Backend Error: ${response.status} ${response.statusText}`);
          probeRows.push(`${endpoint} -> HTTP ${response.status}`);
          continue;
        }

        const { raw: rawResponse, parsed: parsedResponse } = await parseResponseBody(response);
        const normalized = normalizeChatPayload(parsedResponse);
        candidates.push({ endpoint, rawResponse, normalized });
        probeRows.push(`${endpoint} -> ok, images=${normalized.imageUrls.length}, text=${normalized.text.length}`);

        // Prefer candidate with explicit image URLs, otherwise keep probing fallback endpoints.
        if (normalized.imageUrls.length > 0) {
          break;
        }
      } catch (error) {
        lastError = error;
        probeRows.push(`${endpoint} -> fetch error`);
      }
    }

    if (candidates.length === 0) {
      throw lastError instanceof Error ? lastError : new Error('Backend Error: Unable to reach chat endpoint');
    }

    const bestCandidate = candidates
      .slice()
      .sort((a, b) => {
        const byImages = b.normalized.imageUrls.length - a.normalized.imageUrls.length;
        if (byImages !== 0) return byImages;
        return b.normalized.text.length - a.normalized.text.length;
      })[0];

    resolvedEndpoint = bestCandidate.endpoint;
    const rawResponse = bestCandidate.rawResponse;
    const normalizedResponse = bestCandidate.normalized;
    const responseText = normalizedResponse.text;
    // Product decision: image source must come only from backend `imageUrls` payload fields.
    const finalImageUrls = Array.from(new Set([...normalizedResponse.imageUrls]));

    return {
      text: responseText,
      imageUrls: finalImageUrls,
      debugInfo: {
        endpoint: resolvedEndpoint,
        rawResponse: RUNTIME_DEBUG_ENABLED ? rawResponse : undefined,
        normalizedImageUrls: finalImageUrls,
        imageUrlEchoText: finalImageUrls.length > 0 ? finalImageUrls.join('\n') : '(no image urls parsed)',
        probeReport: probeRows.join('\n')
      }
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "系統錯誤，請確認網路連線。", imageUrls: [], debugInfo: { endpoint: undefined, rawResponse: RUNTIME_DEBUG_ENABLED ? String(error) : undefined, normalizedImageUrls: [], imageUrlEchoText: '(error)', probeReport: 'no-success-endpoint' } };
  }
}

export async function parseSOPFile(base64Data: string, mimeType: string): Promise<PendingSOP> {
  try {
    if (!SOP_API_BASE || isWebhookBase(SOP_API_BASE)) {
      throw new Error('目前未設定可用的 SOP API 後端。請設定 VITE_SOP_API_BASE (或 VITE_BACKEND_API_BASE)。');
    }

    const response = await fetch(`${SOP_API_BASE}/api/parse-sop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Parsing failed");
    }

    return await response.json();
  } catch (error: any) {
    console.error("Parse Error:", error);
    throw new Error(error.message || "無法解析文件。");
  }
}

export async function commitSOP(sections: SOPSection[]): Promise<void> {
  if (!SOP_API_BASE || isWebhookBase(SOP_API_BASE)) return;

  const response = await fetch(`${SOP_API_BASE}/api/sop/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });

  if (!response.ok) {
    throw new Error("Failed to commit SOP to backend");
  }
}
