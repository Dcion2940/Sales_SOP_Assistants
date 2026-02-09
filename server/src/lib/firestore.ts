import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Initialize Firebase Admin (assumes GOOGLE_APPLICATION_CREDENTIALS or default env)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const COLLECTION_NAME = 'sops_versions';

export interface SOPImage {
    url?: string; // Signed URL (dynamic)
    gcsPath?: string; // Storage Path
    caption: string;
    keyword: string;
}

export interface SOPSection {
    id: string;
    title: string;
    content: string;
    images?: SOPImage[];
}

export interface SOPVersion {
    versionId: string;
    createdAt: number; // Timestamp
    sections: SOPSection[];
    contentHash: string;
    metadata?: any;
}

// Canonicalize object for hashing
function canonicalize(obj: any): string {
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalize).sort().join(',') + ']';
    } else if (typeof obj === 'object' && obj !== null) {
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',') + '}';
    } else {
        return JSON.stringify(obj);
    }
}

export async function saveVersion(sections: SOPSection[], metadata: any = {}): Promise<string> {
    // 1. Sanitize: Remove 'url' (signed URL) from images, keep only gcsPath
    const cleanSections = sections.map(s => ({
        ...s,
        images: s.images?.map(img => ({
            gcsPath: img.gcsPath,
            caption: img.caption,
            keyword: img.keyword
            // Note: we explicitly drop 'url' here
        }))
    }));

    // 2. Canonicalize & Hash
    const jsonString = canonicalize(cleanSections);
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    // 3. Check for Existing Hash (Deduplication)
    const snapshot = await db.collection(COLLECTION_NAME)
        .where('contentHash', '==', hash)
        .limit(1)
        .get();

    if (!snapshot.empty) {
        console.log(`[Firestore] Duplicate version detected (Hash: ${hash}). Skipping save.`);
        return snapshot.docs[0].data().versionId;
    }

    // 4. Save New Version
    const versionId = uuidv4();
    const docRef = db.collection(COLLECTION_NAME).doc(versionId);
    const versionData: SOPVersion = {
        versionId,
        createdAt: Date.now(),
        sections: cleanSections,
        contentHash: hash,
        metadata
    };

    await docRef.set(versionData);
    console.log(`[Firestore] Saved new version: ${versionId}`);
    return versionId;
}

export async function getLatestVersion(): Promise<SOPSection[] | null> {
    const snapshot = await db.collection(COLLECTION_NAME)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const data = snapshot.docs[0].data() as SOPVersion;
    return data.sections;
}

function uuidv4(): string {
    return crypto.randomUUID();
}
