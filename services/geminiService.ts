import { ChatHistory, SOPSection, PendingSOP } from "../types";
import { API_BASE } from './apiConfig';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const getChatEndpoints = (): string[] => {
  const base = trimTrailingSlash(API_BASE);
  const apiRoute = `${base}/api/chat`;

  if (/\/webhook(\/|$)/i.test(base)) {
    return [base, apiRoute];
  }

  return [apiRoute, base];
};


const isWebhookEndpoint = (endpoint: string): boolean => /\/webhook(\/|$)/i.test(endpoint);

const parseResponseBody = async (response: Response): Promise<{ raw: string; parsed: unknown }> => {
  const raw = await response.text();
  return { raw, parsed: parseJsonIfString(raw) };
};

const postChatPayload = async (
  endpoint: string,
  payload: { conversationId: string; userInput: string; history: ChatHistory[] }
): Promise<Response> => {
  // n8n webhook often rejects CORS preflight for application/json.
  // Use a simple request for webhook endpoints to avoid OPTIONS preflight.
  if (isWebhookEndpoint(endpoint)) {
    return fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

type BackendChatPayload = {
  text?: unknown;
  imageUrls?: unknown;
  image_urls?: unknown;
  images?: unknown;
  imageUrl?: unknown;
  image_url?: unknown;
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
      const origin = trimTrailingSlash(API_BASE);
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

  const urls = text.match(/https?:\/\/[^\s)\]\"]+/gi) || [];
  return urls.filter((url) => /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url));
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
  const text = isNonEmptyString(finalPayload.text) ? finalPayload.text.trim() : '';

  // Fallback for n8n/custom payloads where text/image fields are nested deeply.
  const flattenedObjects = flattenObjects(parsedPayload);
  const fallbackText = flattenedObjects
    .map((obj) => obj.text)
    .find(isNonEmptyString);
  const nestedImageUrls = flattenedObjects.flatMap((obj) =>
    normalizeImageUrls(
      obj.imageUrls ?? obj.image_urls ?? obj.images ?? obj.imageUrl ?? obj.image_url
    )
  );

  const resolvedText = text || (isNonEmptyString(fallbackText) ? fallbackText.trim() : '');
  const imageUrlsFromText = extractImageUrlsFromText(resolvedText);

  return {
    text: resolvedText,
    imageUrls: Array.from(
      new Set([
        ...imageUrls,
        ...snakeCaseImageUrls,
        ...images,
        ...singleImageUrls,
        ...snakeCaseSingleImage,
        ...nestedImageUrls,
        ...imageUrlsFromText
      ])
    )
  };
};

export async function sendMessageToBot(
  userInput: string,
  history: ChatHistory[],
  systemInstruction: string,
  sopKnowledge: SOPSection[],
  conversationId: string
): Promise<{ text: string; imageUrls: string[]; debugInfo?: { endpoint?: string; rawResponse?: string; normalizedImageUrls?: string[] } }> {
  try {
    let response: Response | null = null;
    let resolvedEndpoint: string | undefined;
    let lastError: unknown = null;

    for (const endpoint of getChatEndpoints()) {
      try {
        const candidate = await postChatPayload(endpoint, {
          conversationId,
          userInput,
          history
        });

        if (candidate.ok) {
          response = candidate;
          resolvedEndpoint = endpoint;
          break;
        }

        lastError = new Error(`Backend Error: ${candidate.status} ${candidate.statusText}`);
      } catch (error) {
        lastError = error;
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error('Backend Error: Unable to reach chat endpoint');
    }

    const { raw: rawResponse, parsed: parsedResponse } = await parseResponseBody(response);
    const normalizedResponse = normalizeChatPayload(parsedResponse);
    const responseText = normalizedResponse.text;

    // Frontend Logic: Extract Images based on Keywords (as requested to keep)
    // The backend provides the context, so the model should output keywords.
    // We match against `sopKnowledge` (which is now likely capable of holding signed URLs from the get go)
    const foundImageUrls: string[] = [];

    // Note: sopKnowledge comes from StorageManager which syncs with backend /api/sop/current
    // So it should have the latest images and keywords.
    sopKnowledge.forEach(section => {
      section.images?.forEach(img => {
        const escapedKeyword = img.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKeyword, 'i');
        if (regex.test(responseText)) {
          if (img.url) foundImageUrls.push(img.url);
        }
      });
    });

    const finalImageUrls = Array.from(new Set([...normalizedResponse.imageUrls, ...foundImageUrls]));

    return {
      text: responseText,
      imageUrls: finalImageUrls,
      debugInfo: import.meta.env.DEV
        ? {
            endpoint: resolvedEndpoint,
            rawResponse,
            normalizedImageUrls: finalImageUrls
          }
        : undefined
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "系統錯誤，請確認網路連線。", imageUrls: [], debugInfo: import.meta.env.DEV ? { endpoint: undefined, rawResponse: String(error), normalizedImageUrls: [] } : undefined };
  }
}

export async function parseSOPFile(base64Data: string, mimeType: string): Promise<PendingSOP> {
  try {
    const response = await fetch(`${API_BASE}/api/parse-sop`, {
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
  const response = await fetch(`${API_BASE}/api/sop/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });

  if (!response.ok) {
    throw new Error("Failed to commit SOP to backend");
  }
}
