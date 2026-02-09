import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import * as mammoth from 'mammoth';
import * as gcs from './lib/gcs';
import * as firestore from './lib/firestore';
import * as llm from './lib/llm';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Strict Logging Middleware
morgan.token('sanitized-body', (req: any) => {
    if (req.method === 'POST') {
        return JSON.stringify({
            ...req.body,
            base64Data: '[REDACTED]',
            sections: '[REDACTED]',
            history: '[REDACTED]'
        });
    }
    return '';
});
app.use(morgan(':method :url :status :res[content-length] - :response-time ms :sanitized-body'));

// Routes

// 1. Chat API
app.post('/api/chat', async (req, res) => {
    try {
        const { userInput, history } = req.body;

        // Fetch Latest SOP (Source of Truth)
        const sops = await firestore.getLatestVersion() || [];

        // Construct Context (Text Only - No Signed URLs needed for LLM)
        const knowledgeContext = sops.map(s => {
            const imageKeywords = s.images && s.images.length > 0
                ? `\n[可用圖片關鍵字: ${s.images.map(i => i.keyword).join(', ')}]`
                : '';
            return `--- SOP: ${s.title} ---\n${s.content}${imageKeywords}`;
        }).join('\n\n');

        const systemInstruction = process.env.SYSTEM_INSTRUCTION || "你是 SOP 助手。";
        const fullPrompt = `請根據以下 SOP 知識庫回答使用者的問題。如果回覆內容涉及特定步驟且有對應的「可用圖片關鍵字」，請務必在回覆中包含該關鍵字（格式如：[顯示圖片: 關鍵字]）。\n\n知識庫內容：\n${knowledgeContext}\n\n使用者問題：${userInput}`;

        const text = await llm.chat(fullPrompt, history, systemInstruction);
        res.json({ text });
    } catch (error: any) {
        console.error("Chat Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Parse SOP API
app.post('/api/parse-sop', async (req, res) => {
    try {
        const { base64Data, mimeType } = req.body;

        // Upload Original File to GCS
        const gcsPath = await gcs.uploadFile(base64Data, mimeType);

        // Extract Text (if DOCX) or just use empty string for images (LLM will see nothing but rely on user input/title)
        // NOTE: Constraint says "Mammoth only extracts pure text".
        let textContent = "";
        if (mimeType.includes("wordprocessingml")) {
            const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
            const result = await mammoth.extractRawText({ buffer });
            textContent = result.value;
        } else {
            textContent = "（這是一個純圖片或 PDF 上傳，無法提取文字內容，請手動輸入步驟）";
        }

        // Call LLM to structure text
        const pendingSOP = await llm.parseStructure(textContent);

        // Attach GCS Path & Signed URL for preview
        const signedUrl = await gcs.getSignedUrl(gcsPath);

        // Fix up images: Assume any "extracted_image_0" maps to the uploaded file
        pendingSOP.sections = pendingSOP.sections.map((s: any) => ({
            ...s,
            images: s.images?.map((img: any) => {
                if (img.url?.includes("extracted_image")) {
                    return { ...img, url: signedUrl, gcsPath, keyword: s.title };
                }
                return img;
            })
        }));

        // Fallback: If no images found but it was an image upload, force attach it
        if (mimeType.startsWith('image/') && pendingSOP.sections.length > 0) {
            if (!pendingSOP.sections[0].images) pendingSOP.sections[0].images = [];
            pendingSOP.sections[0].images.push({
                url: signedUrl,
                gcsPath: gcsPath,
                caption: "上傳的圖片",
                keyword: pendingSOP.sections[0].title
            });
        }

        res.json(pendingSOP);

    } catch (error: any) {
        console.error("Parse Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3. Commit SOP API
app.post('/api/sop/commit', async (req, res) => {
    try {
        const { sections, metadata } = req.body;
        const versionId = await firestore.saveVersion(sections, metadata);
        res.json({ versionId, success: true });
    } catch (error: any) {
        console.error("Commit Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Get Current SOP API
app.get('/api/sop/current', async (req, res) => {
    try {
        const sections = await firestore.getLatestVersion();
        if (!sections) return res.json([]);

        // Hydrate with Signed URLs
        const hydratedSections = await Promise.all(sections.map(async (s) => ({
            ...s,
            images: await Promise.all((s.images || []).map(async (img) => ({
                ...img,
                url: img.gcsPath ? await gcs.getSignedUrl(img.gcsPath) : undefined
            })))
        })));

        res.json(hydratedSections);
    } catch (error: any) {
        console.error("Get SOP Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
