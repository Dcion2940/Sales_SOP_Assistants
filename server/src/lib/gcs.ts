import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'your-bucket-name';
const bucket = storage.bucket(bucketName);

// Configurable Signed URL TTL (default 12 hours)
const SIGNED_URL_TTL_SECONDS = parseInt(process.env.SIGNED_URL_TTL_SECONDS || '43200', 10);

export async function uploadFile(base64Data: string, mimeType: string): Promise<string> {
    // 1. Generate unique filename
    const ext = mimeType.split('/')[1] || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    const gcsPath = `uploads/${filename}`;
    const file = bucket.file(gcsPath);

    // 2. Prepare buffer
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 string');
    }
    const buffer = Buffer.from(matches[2], 'base64');

    // 3. Upload
    await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
        validation: false, // for speed
    });

    return gcsPath;
}

export async function getSignedUrl(gcsPath: string): Promise<string> {
    const options = {
        version: 'v4' as const,
        action: 'read' as const,
        expires: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    };

    const [url] = await bucket.file(gcsPath).getSignedUrl(options);
    return url;
}
