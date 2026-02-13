
import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, ChatHistory, SOPSection, ChatSession, PendingSOP, SOPImage, PendingSOPSection } from './types';
import { SOP_KNOWLEDGE as INITIAL_SOP, SYSTEM_INSTRUCTION as INITIAL_SYSTEM } from './constants';
import { sendMessageToBot, parseSOPFile } from './services/geminiService';
import { StorageManager } from './services/storageManager';
import { 
  BuildingOfficeIcon, 
  ChatBubbleLeftRightIcon, 
  DocumentTextIcon, 
  PaperAirplaneIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  CpuChipIcon,
  LockClosedIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  PhotoIcon,
  EyeIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';


function generateConversationId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const App: React.FC = () => {
  // --- Global State ---
  const [view, setView] = useState<'chat' | 'admin'>('chat');
  const [sopKnowledge, setSopKnowledge] = useState<SOPSection[]>([]);
  const [systemInstruction, setSystemInstruction] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // --- Admin Rules Edit State ---
  const [stagedInstruction, setStagedInstruction] = useState('');
  
  // --- UI State ---
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  
  // Per-SOP Preview State (for Admin panel)
  const [sopPreviewModes, setSopPreviewModes] = useState<Record<string, boolean>>({});
  const [pendingPreviewMode, setPendingPreviewMode] = useState(false);

  // --- File Upload & Review State ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [pendingSOP, setPendingSOP] = useState<PendingSOP | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState(0);
  const [showImageAddForm, setShowImageAddForm] = useState<string | null>(null);
  const [newImageData, setNewImageData] = useState<SOPImage>({ url: '', caption: '', keyword: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const storedSop = StorageManager.getSOPKnowledge();
    const storedInstruction = StorageManager.getSystemInstruction();
    const storedSessions = StorageManager.getSessions();

    const initialSop = storedSop || INITIAL_SOP;
    const initialInstruction = storedInstruction || INITIAL_SYSTEM;

    setSopKnowledge(initialSop);
    setSystemInstruction(initialInstruction);
    setStagedInstruction(initialInstruction);
    
    if (storedSessions && storedSessions.length > 0) {
      setSessions(storedSessions);
      setActiveSessionId(storedSessions[0].id);
    } else {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        conversationId: generateConversationId(),
        title: '新對話',
        timestamp: Date.now(),
        messages: [{ role: 'assistant', text: '您好！我是國外部 SOP 助手。請問今天能幫您什麼？' }],
        history: []
      };
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    }
  }, []);

  // --- Persistence Side Effects ---
  useEffect(() => {
    if (sopKnowledge.length > 0) StorageManager.saveSOPKnowledge(sopKnowledge);
  }, [sopKnowledge]);

  useEffect(() => {
    if (sessions.length > 0) StorageManager.saveSessions(sessions);
  }, [sessions]);

  const activeSession = useMemo(() => 
    sessions.find(s => s.id === activeSessionId) || sessions[0], 
  [sessions, activeSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isLoading, view]);

  // --- Helpers ---
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // --- Handlers ---
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !activeSessionId) return;

    const currentInput = inputValue;
    setInputValue('');
    const userMessage: Message = { role: 'user', text: currentInput };
    
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: s.messages.length <= 1 ? (currentInput.slice(0, 15) + (currentInput.length > 15 ? '...' : '')) : s.title,
          messages: [...s.messages, userMessage]
        };
      }
      return s;
    }));

    setIsLoading(true);
    const result = await sendMessageToBot(currentInput, activeSession.history, systemInstruction, sopKnowledge, activeSession.conversationId);
    
    const botMessage: Message = { role: 'assistant', text: result.text, imageUrls: result.imageUrls, debugInfo: result.debugInfo };

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, botMessage],
          history: [...s.history, { role: 'user', parts: [{ text: currentInput }] }, { role: 'model', parts: [{ text: result.text }] }]
        };
      }
      return s;
    }));
    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const parsed = await parseSOPFile(base64, file.type);
      setPendingSOP(parsed);
      setActiveReviewTab(0);
      setPendingPreviewMode(false);
    } catch (err: any) {
      setUploadError(err.message || "無法解析文件。");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmPendingSOP = () => {
    if (!pendingSOP) return;
    
    const selectedSections = pendingSOP.sections.filter(s => s.selected);
    if (selectedSections.length === 0) {
      setUploadError("請至少選取一個區段進行核可。");
      return;
    }

    const newSops: SOPSection[] = selectedSections.map(s => ({
      id: crypto.randomUUID(),
      title: s.title,
      content: s.content,
      images: s.images || []
    }));

    setSopKnowledge(prev => [...prev, ...newSops]);
    setPendingSOP(null);
  };

  const togglePendingSectionSelection = (index: number) => {
    if (!pendingSOP) return;
    const updatedSections = [...pendingSOP.sections];
    updatedSections[index].selected = !updatedSections[index].selected;
    setPendingSOP({ ...pendingSOP, sections: updatedSections });
  };

  const updatePendingSection = (index: number, field: keyof PendingSOPSection, value: any) => {
    if (!pendingSOP) return;
    const updatedSections = [...pendingSOP.sections];
    (updatedSections[index] as any)[field] = value;
    setPendingSOP({ ...pendingSOP, sections: updatedSections });
  };

  const updatePendingImage = (sectionIdx: number, imgIdx: number, field: keyof SOPImage, value: string) => {
    if (!pendingSOP) return;
    const updatedSections = [...pendingSOP.sections];
    const updatedImages = [...(updatedSections[sectionIdx].images || [])];
    updatedImages[imgIdx] = { ...updatedImages[imgIdx], [field]: value };
    updatedSections[sectionIdx].images = updatedImages;
    setPendingSOP({ ...pendingSOP, sections: updatedSections });
  };

  const deletePendingImage = (sectionIdx: number, imgIdx: number) => {
    if (!pendingSOP) return;
    const updatedSections = [...pendingSOP.sections];
    const updatedImages = [...(updatedSections[sectionIdx].images || [])];
    updatedImages.splice(imgIdx, 1);
    updatedSections[sectionIdx].images = updatedImages;
    setPendingSOP({ ...pendingSOP, sections: updatedSections });
  };

  const handleInstructionSave = () => {
    setSystemInstruction(stagedInstruction);
    StorageManager.saveSystemInstruction(stagedInstruction);
  };

  const handleInstructionCancel = () => {
    setStagedInstruction(systemInstruction);
  };

  const handleAddImage = (sopId: string) => {
    if (!newImageData.url || !newImageData.keyword) return;
    
    const imageDataToSave: SOPImage = {
      ...newImageData,
      caption: newImageData.caption || newImageData.keyword 
    };

    setSopKnowledge(prev => prev.map(sop => {
      if (sop.id === sopId) {
        return { ...sop, images: [...(sop.images || []), imageDataToSave] };
      }
      return sop;
    }));
    
    setNewImageData({ url: '', caption: '', keyword: '' });
    setShowImageAddForm(null);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setNewImageData(prev => ({ ...prev, url: base64 }));
    }
  };

  const handleDeleteImage = (sopId: string, imgIndex: number) => {
    setSopKnowledge(prev => prev.map(sop => {
      if (sop.id === sopId) {
        const newImages = [...(sop.images || [])];
        newImages.splice(imgIndex, 1);
        return { ...sop, images: newImages };
      }
      return sop;
    }));
  };

  const handleAdminAuth = () => {
    if (adminPasswordInput === 'admin123') {
      setIsAdminAuthModalOpen(false);
      setAdminPasswordInput('');
      setView('admin');
    } else {
      setAuthError(true);
    }
  };

  const toggleSopPreview = (id: string) => {
    setSopPreviewModes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isInstructionChanged = stagedInstruction !== systemInstruction;

  // --- Render Views ---
  if (view === 'admin') {
    return (
      <div className="flex flex-col h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('chat')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeftIcon className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">後台管理中心</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
             <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,image/*,.docx"
              onChange={handleFileUpload}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-100 ${isParsing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
              >
                {isParsing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CloudArrowUpIcon className="w-5 h-5" />}
                <span className="font-semibold">{isParsing ? '解析中...' : 'AI 智能上傳 (PDF/Word/圖片)'}</span>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Error Message */}
            {uploadError && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">解析失敗</p>
                  <p className="text-xs text-red-600">{uploadError}</p>
                </div>
                <button onClick={() => setUploadError(null)}><XMarkIcon className="w-4 h-4 text-red-400" /></button>
              </div>
            )}

            {/* System Instruction */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AdjustmentsHorizontalIcon className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-semibold text-slate-800">機器人回答規則</h2>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleInstructionCancel}
                    disabled={!isInstructionChanged}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all border ${isInstructionChanged ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'text-slate-300 border-transparent cursor-not-allowed'}`}
                  >
                    取消變更
                  </button>
                  <button 
                    onClick={handleInstructionSave}
                    disabled={!isInstructionChanged}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${isInstructionChanged ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-300 bg-slate-100 cursor-not-allowed'}`}
                  >
                    確認變更
                  </button>
                </div>
              </div>
              <div className="p-6">
                <textarea 
                  className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-700 font-mono text-sm leading-relaxed"
                  value={stagedInstruction}
                  onChange={(e) => setStagedInstruction(e.target.value)}
                />
              </div>
            </section>

            {/* SOP Knowledge Base */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-semibold text-slate-800">SOP 知識庫列表</h2>
                </div>
                <button 
                  onClick={() => setSopKnowledge([{ id: crypto.randomUUID(), title: '新 SOP 標題', content: '', images: [] }, ...sopKnowledge])}
                  className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <PlusIcon className="w-4 h-4" /> 手動新增
                </button>
              </div>
              <div className="p-6 space-y-6">
                {sopKnowledge.map((sop, idx) => (
                  <div key={sop.id} className="p-6 border border-slate-100 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 mr-4">
                        <input 
                          className="text-lg font-bold bg-slate-50 p-2 rounded-xl border border-slate-100 focus:border-indigo-500 outline-none w-full transition-all text-slate-700"
                          value={sop.title}
                          onChange={(e) => {
                            const updated = [...sopKnowledge];
                            updated[idx].title = e.target.value;
                            setSopKnowledge(updated);
                          }}
                        />
                        <button 
                          onClick={() => toggleSopPreview(sop.id)}
                          title={sopPreviewModes[sop.id] ? "切換至編輯模式" : "切換至預覽模式"}
                          className={`p-2 rounded-xl transition-all border ${sopPreviewModes[sop.id] ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-indigo-500'}`}
                        >
                          {sopPreviewModes[sop.id] ? <PencilSquareIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                        </button>
                      </div>
                      <button onClick={() => setSopKnowledge(sopKnowledge.filter(s => s.id !== sop.id))} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="relative">
                      {sopPreviewModes[sop.id] ? (
                        <div className="w-full min-h-[160px] p-6 bg-slate-50/50 border border-slate-100 rounded-xl prose-custom overflow-y-auto max-h-[400px]">
                           <ReactMarkdown>{sop.content || "*尚無內容*"}</ReactMarkdown>
                        </div>
                      ) : (
                        <textarea 
                          className="w-full h-40 p-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 outline-none text-sm text-slate-600 leading-relaxed font-mono"
                          placeholder="使用 Markdown 撰寫詳細 SOP 內容..."
                          value={sop.content}
                          onChange={(e) => {
                            const updated = [...sopKnowledge];
                            updated[idx].content = e.target.value;
                            setSopKnowledge(updated);
                          }}
                        />
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">關聯圖片庫</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {sop.images?.map((img, imgIdx) => (
                          <div key={imgIdx} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden p-3 flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                              <div 
                                onClick={() => setSelectedImageUrl(img.url)}
                                className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 cursor-zoom-in group-hover:ring-2 group-hover:ring-indigo-500 transition-all flex-shrink-0"
                              >
                                <img src={img.url} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 space-y-1.5 min-w-0">
                                <div className="space-y-0.5">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase block">觸發關鍵字</label>
                                  <input 
                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-100 rounded focus:border-indigo-500 outline-none font-bold"
                                    value={img.keyword}
                                    onChange={(e) => {
                                      const updated = [...sopKnowledge];
                                      const updatedImages = [...(updated[idx].images || [])];
                                      updatedImages[imgIdx] = { ...updatedImages[imgIdx], keyword: e.target.value };
                                      updated[idx].images = updatedImages;
                                      setSopKnowledge(updated);
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                               <label className="text-[9px] font-bold text-slate-400 uppercase block">圖片說明</label>
                               <input 
                                  className="w-full text-[10px] p-1.5 bg-slate-50 border border-slate-100 rounded focus:border-indigo-500 outline-none"
                                  placeholder="說明文字..."
                                  value={img.caption}
                                  onChange={(e) => {
                                    const updated = [...sopKnowledge];
                                    const updatedImages = [...(updated[idx].images || [])];
                                    updatedImages[imgIdx] = { ...updatedImages[imgIdx], caption: e.target.value };
                                    updated[idx].images = updatedImages;
                                    setSopKnowledge(updated);
                                  }}
                               />
                            </div>
                            <button 
                              onClick={() => handleDeleteImage(sop.id, imgIdx)}
                              className="absolute top-2 right-2 bg-slate-100 hover:bg-red-500 text-slate-400 hover:text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <XMarkIcon className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        
                        {showImageAddForm === sop.id ? (
                          <div className="col-span-1 sm:col-span-2 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-indigo-600 block px-1">選擇圖片檔案</label>
                                <div 
                                  onClick={() => imageInputRef.current?.click()}
                                  className="h-20 border-2 border-dashed border-indigo-200 rounded-lg flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-indigo-50 transition-colors overflow-hidden"
                                >
                                  {newImageData.url ? (
                                    <img src={newImageData.url} className="w-full h-full object-contain" />
                                  ) : (
                                    <>
                                      <PhotoIcon className="w-6 h-6 text-indigo-300" />
                                      <span className="text-[10px] text-indigo-400">點擊上傳</span>
                                    </>
                                  )}
                                  <input 
                                    type="file" 
                                    ref={imageInputRef} 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={handleImageFileChange}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-indigo-600 block px-1">觸發關鍵字</label>
                                  <input 
                                    className="w-full text-xs p-2 rounded border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white" 
                                    placeholder="例如：出貨流程圖"
                                    value={newImageData.keyword}
                                    onChange={e => setNewImageData({...newImageData, keyword: e.target.value})}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-indigo-600 block px-1">圖片說明 (選填)</label>
                                  <input 
                                    className="w-full text-xs p-2 rounded border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white" 
                                    placeholder="輸入說明文字..."
                                    value={newImageData.caption}
                                    onChange={e => setNewImageData({...newImageData, caption: e.target.value})}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1 border-t border-indigo-100">
                              <button 
                                onClick={() => {
                                  setShowImageAddForm(null);
                                  setNewImageData({ url: '', caption: '', keyword: '' });
                                }} 
                                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors px-2 py-1"
                              >
                                取消
                              </button>
                              <button 
                                onClick={() => handleAddImage(sop.id)} 
                                disabled={!newImageData.url || !newImageData.keyword}
                                className={`text-[10px] font-bold px-4 py-1.5 rounded-lg shadow-sm transition-all ${
                                  !newImageData.url || !newImageData.keyword 
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                                }`}
                              >
                                確認新增
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              setShowImageAddForm(sop.id);
                              setNewImageData({ url: '', caption: '', keyword: '' });
                            }}
                            className="border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center p-4 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all group min-h-[64px]"
                          >
                            <PlusIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Global Image Zoom Modal */}
        {selectedImageUrl && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 cursor-zoom-out"
            onClick={() => setSelectedImageUrl(null)}
          >
            <div className="relative max-w-5xl w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
              <button 
                className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors z-[110]"
                onClick={() => setSelectedImageUrl(null)}
              >
                <XMarkIcon className="w-8 h-8" />
              </button>
              <img 
                src={selectedImageUrl} 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {/* AI Parse Modal */}
        {pendingSOP && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="bg-indigo-600 p-6 text-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <CpuChipIcon className="w-8 h-8" />
                  <div>
                    <h3 className="text-xl font-bold">AI 解析結果分段預覽</h3>
                    <p className="text-indigo-100 text-xs">請核可以下各個 SOP 主題，選取的項目將被加入知識庫</p>
                  </div>
                </div>
                <button onClick={() => setPendingSOP(null)} className="p-2 hover:bg-indigo-500 rounded-full transition-colors">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="w-64 border-r border-slate-100 bg-slate-50 flex flex-col">
                  <div className="p-4 border-b border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">主題列表 ({pendingSOP.sections.length})</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {pendingSOP.sections.map((section, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveReviewTab(idx)}
                        className={`w-full text-left px-4 py-4 border-b border-slate-100 transition-all flex items-center justify-between group ${activeReviewTab === idx ? 'bg-white font-bold text-indigo-600 shadow-sm border-r-4 border-r-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        <span className="truncate pr-2 text-sm">{section.title}</span>
                        <div 
                          className="p-1 hover:bg-black/5 rounded-full transition-colors flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); togglePendingSectionSelection(idx); }}
                        >
                          {section.selected ? (
                            <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <CheckCircleIcon className="w-5 h-5 text-slate-300 opacity-50 group-hover:opacity-100" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">區段標題</label>
                        <input 
                          className="w-full text-lg font-bold bg-slate-50 border border-slate-100 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-600"
                          value={pendingSOP.sections[activeReviewTab].title}
                          onChange={e => updatePendingSection(activeReviewTab, 'title', e.target.value)}
                        />
                      </div>
                      <div className="pt-6">
                        <button 
                          onClick={() => togglePendingSectionSelection(activeReviewTab)}
                          className={`flex items-center gap-2 px-4 py-4 rounded-xl border transition-all h-[60px] ${pendingSOP.sections[activeReviewTab].selected ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-600'}`}
                        >
                          {pendingSOP.sections[activeReviewTab].selected ? <CheckCircleSolid className="w-6 h-6" /> : <CheckCircleIcon className="w-6 h-6" />}
                          <span className="whitespace-nowrap">{pendingSOP.sections[activeReviewTab].selected ? '已核可' : '尚未核可'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SOP 步驟詳細內容</label>
                         <button 
                          onClick={() => setPendingPreviewMode(!pendingPreviewMode)}
                          className={`text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 transition-all ${pendingPreviewMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                         >
                           {pendingPreviewMode ? <EyeIcon className="w-3 h-3" /> : <PencilSquareIcon className="w-3 h-3" />}
                           {pendingPreviewMode ? '預覽中' : '編輯中'}
                         </button>
                      </div>
                      {pendingPreviewMode ? (
                        <div className="w-full min-h-[192px] p-6 bg-slate-50 rounded-2xl border border-slate-100 prose-custom overflow-y-auto">
                           <ReactMarkdown>{pendingSOP.sections[activeReviewTab].content || "*尚無內容*"}</ReactMarkdown>
                        </div>
                      ) : (
                        <textarea 
                          className="w-full h-48 p-6 bg-slate-50 rounded-2xl border border-slate-100 outline-none text-sm text-slate-600 leading-relaxed font-mono"
                          value={pendingSOP.sections[activeReviewTab].content}
                          onChange={e => updatePendingSection(activeReviewTab, 'content', e.target.value)}
                        />
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">相關圖片</label>
                      <div className="space-y-3">
                        {pendingSOP.sections[activeReviewTab].images?.map((img, imgIdx) => (
                          <div key={imgIdx} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row gap-4">
                            <div className="w-24 h-24 flex-shrink-0 bg-white border rounded-lg overflow-hidden flex items-center justify-center group relative cursor-pointer"
                                 onClick={() => {
                                   const input = document.createElement('input');
                                   input.type = 'file';
                                   input.accept = 'image/*';
                                   input.onchange = async (e: any) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                       const b64 = await fileToBase64(file);
                                       updatePendingImage(activeReviewTab, imgIdx, 'url', b64);
                                     }
                                   };
                                   input.click();
                                 }}>
                              {img.url ? (
                                <img src={img.url} className="w-full h-full object-cover" />
                              ) : (
                                <PhotoIcon className="w-8 h-8 text-slate-200" />
                              )}
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <span className="text-[8px] text-white font-bold uppercase">點擊更換</span>
                              </div>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex gap-2">
                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">關鍵字</span>
                                <input 
                                  className="text-xs bg-transparent border-none outline-none font-bold text-slate-700 w-full"
                                  value={img.keyword}
                                  onChange={e => updatePendingImage(activeReviewTab, imgIdx, 'keyword', e.target.value)}
                                />
                              </div>
                              <input 
                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/10"
                                placeholder="圖片說明文字..."
                                value={img.caption}
                                onChange={e => updatePendingImage(activeReviewTab, imgIdx, 'caption', e.target.value)}
                              />
                            </div>
                            <button 
                              onClick={() => deletePendingImage(activeReviewTab, imgIdx)}
                              className="self-center p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">核可狀態：{pendingSOP.sections.filter(s => s.selected).length} / {pendingSOP.sections.length} 個區段</p>
                    <div className="flex gap-3">
                      <button onClick={() => setPendingSOP(null)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-colors">捨棄取消</button>
                      <button onClick={confirmPendingSOP} className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95">批次加入已選取項目</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 md:flex-row overflow-hidden font-sans">
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white"><BuildingOfficeIcon className="w-6 h-6" /></div>
            <h1 className="font-bold text-slate-800 text-lg">國外部助手</h1>
          </div>
        </div>
        <div className="px-4 mb-4">
          <button onClick={() => {
            const newSession: ChatSession = { id: crypto.randomUUID(), conversationId: generateConversationId(), title: '新對話', timestamp: Date.now(), messages: [{ role: 'assistant', text: '您好！我是國外部 SOP 助手。請問有什麼可以幫您的？' }], history: [] };
            setSessions([newSession, ...sessions]);
            setActiveSessionId(newSession.id);
          }} className="w-full py-2.5 px-4 bg-indigo-50 text-indigo-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all border border-indigo-100">
            <PlusIcon className="w-5 h-5" /> 新對話
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => setActiveSessionId(s.id)} className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 group transition-all relative ${activeSessionId === s.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
              <ChatBubbleLeftRightIcon className={`w-5 h-5 flex-shrink-0 ${activeSessionId === s.id ? 'text-indigo-100' : 'text-slate-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate mb-0.5">{s.title}</p>
                <p className={`text-[10px] ${activeSessionId === s.id ? 'text-indigo-200' : 'text-slate-400'} flex items-center gap-1`}><ClockIcon className="w-3 h-3" />{new Date(s.timestamp).toLocaleDateString()}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setSessions(sessions.filter(ses => ses.id !== s.id)); }} className={`p-1 rounded-md opacity-0 group-hover:opacity-100 ${activeSessionId === s.id ? 'hover:bg-indigo-500' : 'hover:bg-slate-200'}`}><TrashIcon className="w-4 h-4" /></button>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button onClick={() => setIsAdminAuthModalOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all group">
            <Cog6ToothIcon className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
            <span className="text-sm font-medium">後台管理員</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="flex items-center justify-between p-4 md:px-8 bg-white/80 backdrop-blur border-b border-slate-100 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-slate-800">{activeSession?.title}</h2>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {activeSession?.messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 border text-slate-600'}`}>
                  {msg.role === 'user' ? <UserCircleIcon className="w-6 h-6" /> : <CpuChipIcon className="w-5 h-5" />}
                </div>
                <div className="space-y-3">
                  <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none user-message' : 'bg-slate-50 border text-slate-700 rounded-tl-none assistant-message'}`}>
                    <div className="text-sm md:text-base leading-relaxed prose-custom">
                       {msg.role === 'assistant' ? (
                         <ReactMarkdown>{msg.text}</ReactMarkdown>
                       ) : (
                         <div className="whitespace-pre-wrap">{msg.text}</div>
                       )}
                    </div>
                  </div>
                  {msg.imageUrls && msg.imageUrls.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                      {msg.imageUrls.map((url, i) => (
                        <div 
                          key={i} 
                          onClick={() => setSelectedImageUrl(url)}
                          className="group relative rounded-xl overflow-hidden border border-slate-100 bg-white shadow-sm cursor-zoom-in transition-all hover:shadow-md hover:scale-[1.01]"
                        >
                          {/* Changed from object-cover to object-contain to show full image, using a fixed height container */}
                          <div className="h-48 md:h-56 w-full flex items-center justify-center bg-slate-50 p-1">
                             <img src={url} alt="Reference" className="max-w-full max-h-full object-contain" />
                          </div>
                          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <MagnifyingGlassIcon className="w-6 h-6 text-indigo-600/50" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' && import.meta.env.DEV && msg.debugInfo && (
                    <details className="text-xs rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                      <summary className="cursor-pointer font-semibold">Debug: webhook response</summary>
                      <div className="mt-2 space-y-2">
                        <div><span className="font-semibold">Endpoint:</span> {msg.debugInfo.endpoint || 'N/A'}</div>
                        <div><span className="font-semibold">Parsed image count:</span> {msg.debugInfo.normalizedImageUrls?.length || 0}</div>
                        <pre className="whitespace-pre-wrap break-all bg-white border border-amber-100 rounded p-2">{msg.debugInfo.rawResponse || '(empty)'}</pre>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && <div className="flex justify-start"><div className="flex gap-1.5"><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div></div></div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:p-8 border-t border-slate-50 bg-white">
          <div className="max-w-4xl mx-auto flex gap-2">
            <input 
              type="text" placeholder="輸入您的問題..." 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className={`p-3 rounded-2xl transition-all ${!inputValue.trim() || isLoading ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'}`}>
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>

      {isAdminAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto"><LockClosedIcon className="w-8 h-8" /></div>
            <h3 className="text-xl font-bold">管理員驗證</h3>
            <input 
              type="password" autoFocus className={`w-full px-4 py-3 bg-slate-50 border ${authError ? 'border-red-500' : 'border-slate-200'} rounded-xl outline-none focus:ring-4 focus:ring-indigo-100 transition-all`} 
              placeholder="請輸入密碼 (admin123)" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdminAuth()}
            />
            <div className="flex gap-3">
              <button onClick={() => setIsAdminAuthModalOpen(false)} className="flex-1 py-3 text-slate-500 font-medium">取消</button>
              <button onClick={handleAdminAuth} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">登入</button>
            </div>
          </div>
        </div>
      )}

      {selectedImageUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 cursor-zoom-out"
          onClick={() => setSelectedImageUrl(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
            <button 
              className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors z-[110]"
              onClick={() => setSelectedImageUrl(null)}
            >
              <XMarkIcon className="w-8 h-8" />
            </button>
            <img 
              src={selectedImageUrl} 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
