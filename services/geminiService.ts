
import { Message, ChatHistory, SOPSection, PendingSOP } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

export async function sendMessageToBot(
  userInput: string,
  history: ChatHistory[],
  systemInstruction: string,
  sopKnowledge: SOPSection[]
): Promise<{ text: string; imageUrls: string[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userInput,
        history,
        systemInstruction // Note: Backend ignores this as per plan, but we send it for compatibility or logging if needed
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend Error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.text;

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
      imageUrls: Array.from(new Set(foundImageUrls))
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "系統錯誤，請確認網路連線。", imageUrls: [] };
  }
}

export async function parseSOPFile(base64Data: string, mimeType: string): Promise<PendingSOP> {
  try {
    const response = await fetch(`${API_BASE_URL}/parse-sop`, {
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
  const response = await fetch(`${API_BASE_URL}/sop/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });

  if (!response.ok) {
    throw new Error("Failed to commit SOP to backend");
  }
}

