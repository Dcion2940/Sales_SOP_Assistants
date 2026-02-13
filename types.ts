
export interface SOPImage {
  url: string;
  caption: string;
  keyword: string;
}

export interface SOPSection {
  id: string;
  title: string;
  content: string;
  images?: SOPImage[];
}

export interface Message {
  role: 'user' | 'assistant';
  text: string;
  imageUrls?: string[];
  debugInfo?: {
    endpoint?: string;
    rawResponse?: string;
    normalizedImageUrls?: string[];
    imageUrlEchoText?: string;
    probeReport?: string;
  };
}

export interface ChatHistory {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

export interface ChatSession {
  id: string;
  conversationId: string;
  title: string;
  timestamp: number;
  messages: Message[];
  history: ChatHistory[];
}

export interface PendingSOPSection {
  title: string;
  content: string;
  selected: boolean;
  images?: SOPImage[];
}

export interface PendingSOP {
  sections: PendingSOPSection[];
}
