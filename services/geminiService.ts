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

type BackendChatPayload = {
  text?: unknown;
  imageUrls?: unknown;
  imageUrl?: unknown;
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
        obj.imageUrl ??
        obj.image_url?.url ??
        obj.imageUrl?.url ??
        obj.imageUrls ??
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
  const singleImageUrls = normalizeImageUrls(finalPayload.imageUrl);

  return {
    text: isNonEmptyString(finalPayload.text) ? finalPayload.text.trim() : '',
    imageUrls: Array.from(new Set([...imageUrls, ...singleImageUrls]))
  };
};

export async function sendMessageToBot(
  userInput: string,
  history: ChatHistory[],
  systemInstruction: string,
  sopKnowledge: SOPSection[],
  conversationId: string
): Promise<{ text: string; imageUrls: string[] }> {
  try {
    let response: Response | null = null;
    let lastError: unknown = null;

    for (const endpoint of getChatEndpoints()) {
      try {
        const candidate = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            userInput,
            history
          }),
        });

        if (candidate.ok) {
          response = candidate;
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

    const data = await response.json();
    const normalizedResponse = normalizeChatPayload(data);
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

    return {
      text: responseText,
      imageUrls: Array.from(new Set([...normalizedResponse.imageUrls, ...foundImageUrls]))
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "系統錯誤，請確認網路連線。", imageUrls: [] };
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
