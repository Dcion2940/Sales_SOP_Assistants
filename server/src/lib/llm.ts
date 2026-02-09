import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-3-flash-preview';
const PARSE_MODEL = process.env.PARSE_MODEL || 'gemini-3-pro-preview';

// Initialize Clients (Lazy)
let geminiClient: GoogleGenAI | null = null;
let groqClient: Groq | null = null;

function getGeminiClient(): GoogleGenAI {
    if (!geminiClient) {
        if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
        geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }
    return geminiClient;
}

function getGroqClient(): Groq {
    if (!groqClient) {
        if (!GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");
        groqClient = new Groq({ apiKey: GROQ_API_KEY });
    }
    return groqClient;
}

export async function chat(prompt: string, history: any[], systemInstruction: string): Promise<string> {
    if (LLM_PROVIDER === 'groq') {
        const groq = getGroqClient();
        const messages = [
            { role: "system", content: systemInstruction },
            ...history.map((h: any) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text })),
            { role: "user", content: prompt }
        ];
        const completion = await groq.chat.completions.create({
            messages: messages as any,
            model: "llama3-70b-8192", // Default Groq model
        });
        return completion.choices[0]?.message?.content || "";
    } else {
        // Default Gemini
        const ai = getGeminiClient();
        const model = ai.getGenerativeModel({ model: CHAT_MODEL, systemInstruction });
        const chatSession = model.startChat({
            history: history.map((h: any) => ({ role: h.role, parts: h.parts })),
        });
        const result = await chatSession.sendMessage(prompt);
        return result.response.text();
    }
}

export async function parseStructure(textContext: string): Promise<any> {
    // Always use Gemini for parsing structure as it's better at JSON schema adherence
    const ai = getGeminiClient();
    const model = ai.getGenerativeModel({
        model: PARSE_MODEL,
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `請解析以下內容並生成標準作業程序 (SOP)。\n\n內容：\n${textContext}\n\n回傳 JSON 格式: { sections: [{ title, content, images: [{ url: "extracted_image_INDEX", caption, keyword }] }] }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
}
