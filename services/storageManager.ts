
import { SOPSection, ChatSession } from '../types';
import { commitSOP } from './geminiService';
import { API_BASE } from './apiConfig';


function generateConversationId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const KEYS = {
  SOP_KNOWLEDGE: 'global_dept_sop_knowledge',
  SYSTEM_INSTRUCTION: 'global_dept_system_instruction',
  CHAT_SESSIONS: 'global_dept_chat_sessions',
};

// In-Memory Cache
let sopCache: SOPSection[] | null = null;
let initPromise: Promise<void> | null = null;

async function initSync() {
  try {
    const response = await fetch(`${API_BASE}/api/sop/blocks`);
    if (response.ok) {
      const data: SOPSection[] = await response.json();
      if (data && Array.isArray(data)) {
        sopCache = data;
        localStorage.setItem(KEYS.SOP_KNOWLEDGE, JSON.stringify(data));
        // Dispatch Event for UI to pickup changes if it supports it
        window.dispatchEvent(new Event('kb_sop_updated'));
      }
    }
  } catch (err) {
    console.error("Failed to sync SOP from backend on init:", err);
  }
}

// Auto-run init on module load
initPromise = initSync();

export const StorageManager = {
  saveSOPKnowledge(data: SOPSection[]) {
    // 1. Update Local (Immediate UI)
    sopCache = data;
    localStorage.setItem(KEYS.SOP_KNOWLEDGE, JSON.stringify(data));

    // 2. Commit to Backend (Background)
    commitSOP(data).catch(err => {
      console.error("Background Commit Failed:", err);
    });
  },

  getSOPKnowledge(): SOPSection[] | null {
    // Priority: Cache -> LocalStorage
    if (sopCache) return sopCache;

    const data = localStorage.getItem(KEYS.SOP_KNOWLEDGE);
    if (data) {
      sopCache = JSON.parse(data);
      return sopCache;
    }
    return null;
  },

  saveSystemInstruction(instruction: string) {
    localStorage.setItem(KEYS.SYSTEM_INSTRUCTION, instruction);
  },

  getSystemInstruction(): string | null {
    return localStorage.getItem(KEYS.SYSTEM_INSTRUCTION);
  },

  saveSessions(sessions: ChatSession[]) {
    localStorage.setItem(KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
  },

  getSessions(): ChatSession[] | null {
    const data = localStorage.getItem(KEYS.CHAT_SESSIONS);
    if (!data) return null;

    const parsed: ChatSession[] = JSON.parse(data);
    let migrated = false;

    const sessionsWithConversationId = parsed.map(session => {
      if (session.conversationId) return session;
      migrated = true;
      return { ...session, conversationId: generateConversationId() };
    });

    if (migrated) {
      localStorage.setItem(KEYS.CHAT_SESSIONS, JSON.stringify(sessionsWithConversationId));
    }

    return sessionsWithConversationId;
  },

  clearAll() {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    sopCache = null;
  },

  getStorageStats() {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length + key.length) * 2;
      }
    }
    return {
      usedBytes: total,
      usedKB: Math.round(total / 1024),
      usedMB: (total / (1024 * 1024)).toFixed(2),
      percent: Math.min(Math.round((total / (5 * 1024 * 1024)) * 100), 100)
    };
  }
};

