/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel, Type } from "@google/genai";
import { 
  Send, 
  User, 
  Bot, 
  Plus, 
  MessageSquare, 
  Settings, 
  Menu, 
  X, 
  Sparkles,
  Heart,
  Shield,
  BookOpen,
  History,
  Search,
  Image as ImageIcon,
  Loader2,
  Trash2,
  ExternalLink,
  BrainCircuit,
  Languages,
  Mic,
  MicOff,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isThinking?: boolean;
  imageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: number;
}

interface Topic {
  id: string;
  title: string;
  icon: React.ReactNode;
  prompt: string;
}

type ViewMode = 'chat' | 'scripture' | 'prayer' | 'gallery' | 'fasting' | 'translator' | 'affirmations';

interface UserSettings {
  useThinking: boolean;
  theme: 'light' | 'dark';
  notifications: boolean;
}

// --- Constants ---
const TOPICS: Topic[] = [
  { id: 'anxiety', title: 'Finding Peace', icon: <Sparkles className="w-4 h-4" />, prompt: "I'm feeling anxious about my digital life. Can we talk about finding peace?" },
  { id: 'addiction', title: 'Digital Balance', icon: <Shield className="w-4 h-4" />, prompt: "I'm struggling with social media addiction. How can I find balance?" },
  { id: 'identity', title: 'True Identity', icon: <User className="w-4 h-4" />, prompt: "I feel like I'm losing my identity to social media. Who am I in Christ?" },
  { id: 'bullying', title: 'Overcoming Hurt', icon: <Heart className="w-4 h-4" />, prompt: "I've been hurt by cyberbullying. How can I heal and forgive?" },
];

const PRAYER_TEMPLATES = [
  { id: 'gratitude', title: 'Gratitude', icon: <Sparkles className="w-4 h-4" />, prompt: "I want to offer a prayer of gratitude for the blessings in my life, specifically..." },
  { id: 'forgiveness', title: 'Forgiveness', icon: <Heart className="w-4 h-4" />, prompt: "I am seeking strength to forgive someone who has hurt me deeply. Please guide me in a prayer for forgiveness..." },
  { id: 'strength', title: 'Strength', icon: <Shield className="w-4 h-4" />, prompt: "I feel weak and overwhelmed by my current challenges. I need a prayer for divine strength and endurance..." },
];

const SYSTEM_PROMPT = `
You are "Elias' Assistant," an AI pastoral assistant. You are a compassionate, scripture-anchored guide helping individuals struggling with social media abuse, cybercrime victimisation, and mental health challenges.

GOAL:
Provide biblically grounded emotional and spiritual support that reduces distress, promotes healthy digital habits, and offers practical advice—all while maintaining a warm, non-judgmental, and hopeful tone.

CONSTRAINTS:
1. DO NOT provide medical diagnoses or prescribe medication.
2. ALWAYS include a disclaimer for serious concerns: "This conversation is not a substitute for professional mental health care."
3. RESPOND in English or the user's preferred language (Luganda, Runyankole, Runyoro, Runyakitara, Swahili, French, Kinyarwanda, Acholi, or Langi) if they initiate in that language or request it.
4. LIMIT responses to 3-5 short paragraphs.
5. ALWAYS use the King James Version (KJV) of the Bible.
6. ALWAYS include full citations for all scripture references (e.g., Genesis 1:1).
7. If translating, ensure the spiritual meaning and tone are preserved.

OUTPUT STRUCTURE:
1. ACKNOWLEDGMENT: Reflect the user's emotion.
2. SCRIPTURE: Quote one relevant Bible verse (KJV) with full citation.
3. SPIRITUAL INSIGHT: Apply the verse.
4. PRACTICAL STEP: One actionable, technology-specific recommendation.
5. CLOSING PRAYER (Optional): A brief one-sentence prayer.
`;

const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'lg', name: 'Luganda' },
  { id: 'ny', name: 'Runyankole' },
  { id: 'ro', name: 'Runyoro' },
  { id: 'rk', name: 'Runyakitara' },
  { id: 'sw', name: 'Swahili' },
  { id: 'fr', name: 'French' },
  { id: 'rw', name: 'Kinyarwanda' },
  { id: 'ach', name: 'Acholi' },
  { id: 'lan', name: 'Langi' },
];

export default function App() {
  // --- State ---
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('shepherd_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('shepherd_settings');
    return saved ? JSON.parse(saved) : {
      useThinking: false,
      theme: 'light',
      notifications: true
    };
  });

  const useThinking = settings.useThinking;
  const setUseThinking = (val: boolean) => setSettings(prev => ({ ...prev, useThinking: val }));
  
  // Scripture Search State
  const [scriptureQuery, setScriptureQuery] = useState('');
  const [scriptureResult, setScriptureResult] = useState<string | null>(null);
  const [isSearchingScripture, setIsSearchingScripture] = useState(false);

  // Prayer State
  const [prayerRequest, setPrayerRequest] = useState('');
  const [prayerResponse, setPrayerResponse] = useState<string | null>(null);
  const [isPraying, setIsPraying] = useState(false);

  // Image Gen State
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Translator State
  const [translatorInput, setTranslatorInput] = useState('');
  const [translatorOutput, setTranslatorOutput] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('lg');
  const [isTranslating, setIsTranslating] = useState(false);

  // Affirmations State
  const [dailyAffirmation, setDailyAffirmation] = useState<string | null>(() => {
    const saved = localStorage.getItem('shepherd_daily_affirmation');
    const savedDate = localStorage.getItem('shepherd_affirmation_date');
    const today = new Date().toDateString();
    return savedDate === today ? saved : null;
  });
  const [isGeneratingAffirmation, setIsGeneratingAffirmation] = useState(false);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Derived State ---
  const currentChat = useMemo(() => 
    conversations.find(c => c.id === currentChatId) || null
  , [conversations, currentChatId]);

  const filteredHistory = useMemo(() => 
    conversations.filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const chatDate = new Date(c.lastUpdated);
      const matchesStartDate = !startDate || chatDate >= new Date(startDate);
      const matchesEndDate = !endDate || chatDate <= new Date(endDate + 'T23:59:59');
      
      return matchesSearch && matchesStartDate && matchesEndDate;
    }).sort((a, b) => b.lastUpdated - a.lastUpdated)
  , [conversations, searchQuery, startDate, endDate]);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('shepherd_chats', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('shepherd_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (dailyAffirmation) {
      localStorage.setItem('shepherd_daily_affirmation', dailyAffirmation);
      localStorage.setItem('shepherd_affirmation_date', new Date().toDateString());
    }
  }, [dailyAffirmation]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (viewMode === 'chat') setInput(prev => prev + ' ' + transcript);
        if (viewMode === 'prayer') setPrayerRequest(prev => prev + ' ' + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [viewMode]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Speech recognition error:", e);
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- Handlers ---
  const startNewChat = () => {
    const newChat: Conversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      lastUpdated: Date.now()
    };
    setConversations(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setViewMode('chat');
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) setCurrentChatId(null);
  };

  const handleSendMessage = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    let chatId = currentChatId;
    if (!chatId) {
      const newChat: Conversation = {
        id: Date.now().toString(),
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
        lastUpdated: Date.now()
      };
      setConversations(prev => [newChat, ...prev]);
      chatId = newChat.id;
      setCurrentChatId(newChat.id);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setConversations(prev => prev.map(c => 
      c.id === chatId ? { 
        ...c, 
        messages: [...c.messages, userMessage],
        lastUpdated: Date.now(),
        title: c.messages.length === 0 ? text.slice(0, 30) + (text.length > 30 ? '...' : '') : c.title
      } : c
    ));

    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const modelName = useThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
      const config: any = {
        systemInstruction: SYSTEM_PROMPT,
      };

      if (useThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          ...currentChat?.messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })) || [],
          { role: 'user', parts: [{ text: text }] }
        ],
        config
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || "I'm sorry, I couldn't process that.",
        timestamp: Date.now(),
        isThinking: useThinking
      };

      setConversations(prev => prev.map(c => 
        c.id === chatId ? { ...c, messages: [...c.messages, assistantMessage], lastUpdated: Date.now() } : c
      ));
    } catch (error) {
      console.error("Gemini API Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScriptureSearch = async () => {
    if (!scriptureQuery.trim() || isSearchingScripture) return;
    setIsSearchingScripture(true);
    setScriptureResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find and explain the Bible verse(s) related to: ${scriptureQuery}. Provide the full text and a brief pastoral context.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      setScriptureResult(response.text || "No results found.");
    } catch (error) {
      setScriptureResult("Error searching for scripture.");
    } finally {
      setIsSearchingScripture(false);
    }
  };

  const handlePrayerRequest = async () => {
    if (!prayerRequest.trim() || isPraying) return;
    setIsPraying(true);
    setPrayerResponse(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `As a compassionate pastor, offer a guided prayer or response to this prayer request: ${prayerRequest}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
      setPrayerResponse(response.text || "I am praying with you.");
    } catch (error) {
      setPrayerResponse("Error processing prayer request.");
    } finally {
      setIsPraying(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    
    // Check for API key selection for Veo/Pro models
    if (!(await (window as any).aistudio.hasSelectedApiKey())) {
      await (window as any).aistudio.openSelectKey();
      return;
    }

    setIsGeneratingImage(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `A beautiful, spiritual, and calming artistic representation of: ${imagePrompt}. High quality, cinematic lighting.` }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize
          }
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error: any) {
      console.error("Image Gen Error:", error);
      if (error.message?.includes("Requested entity was not found")) {
        await (window as any).aistudio.openSelectKey();
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleTranslate = async () => {
    if (!translatorInput.trim() || isTranslating) return;
    setIsTranslating(true);
    setTranslatorOutput('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const src = LANGUAGES.find(l => l.id === sourceLang)?.name;
      const tgt = LANGUAGES.find(l => l.id === targetLang)?.name;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate the following text from ${src} to ${tgt}. Ensure the tone is respectful and spiritually appropriate if applicable: "${translatorInput}"`,
      });
      setTranslatorOutput(response.text || "Translation failed.");
    } catch (error) {
      setTranslatorOutput("Error during translation.");
    } finally {
      setIsTranslating(false);
    }
  };

  const generateDailyAffirmation = async () => {
    if (isGeneratingAffirmation) return;
    setIsGeneratingAffirmation(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate a powerful, scripture-based daily affirmation for digital well-being and mental peace. Use KJV and include the citation.",
      });
      setDailyAffirmation(response.text || "You are fearfully and wonderfully made. (Psalm 139:14)");
    } catch (error) {
      console.error("Affirmation Error:", error);
    } finally {
      setIsGeneratingAffirmation(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="w-80 bg-white border-r border-slate-200 flex flex-col z-30"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h1 className="font-bold text-xl tracking-tight text-slate-800">Shepherd</h1>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <button 
                onClick={startNewChat}
                className="w-full flex items-center gap-3 p-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus className="w-5 h-5" />
                New Conversation
              </button>

              {/* Navigation */}
              <div className="space-y-1">
                <button 
                  onClick={() => { setViewMode('chat'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'chat' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Elias' Assistant
                </button>
                <button 
                  onClick={() => { setViewMode('affirmations'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'affirmations' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Sun className="w-4 h-4" />
                  Daily Affirmations
                </button>
                <button 
                  onClick={() => { setViewMode('scripture'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'scripture' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Search className="w-4 h-4" />
                  Scripture Search
                </button>
                <button 
                  onClick={() => { setViewMode('prayer'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'prayer' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Heart className="w-4 h-4" />
                  Prayer Room
                </button>
                <button 
                  onClick={() => { setViewMode('gallery'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'gallery' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <ImageIcon className="w-4 h-4" />
                  Spiritual Art
                </button>
                <button 
                  onClick={() => { setViewMode('fasting'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'fasting' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <BrainCircuit className="w-4 h-4" />
                  Digital Fasting
                </button>
                <button 
                  onClick={() => { setViewMode('translator'); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${viewMode === 'translator' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Languages className="w-4 h-4" />
                  Language & Translation
                </button>
              </div>

              {/* History Search */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase px-1">From</span>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none focus:border-indigo-300"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase px-1">To</span>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none focus:border-indigo-300"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Chats</h2>
                <div className="space-y-1">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((chat) => (
                      <div
                        key={chat.id}
                        onClick={() => {
                          setCurrentChatId(chat.id);
                          setViewMode('chat');
                        }}
                        className={`group w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id ? 'bg-slate-100 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <MessageSquare className="w-4 h-4 shrink-0" />
                          <span className="truncate">{chat.title}</span>
                        </div>
                        <button 
                          onClick={(e) => deleteChat(chat.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-400 italic flex items-center gap-2">
                      <History className="w-4 h-4" />
                      No matches found
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100">
              <button className="w-full flex items-center gap-3 p-3 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
                <Settings className="w-5 h-5" />
                Settings
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-slate-500" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-slate-600">
                {viewMode === 'chat' ? "Elias' Assistant" : 
                 viewMode === 'scripture' ? 'Scripture Search' : 
                 viewMode === 'prayer' ? 'Prayer Room' : 
                 viewMode === 'fasting' ? 'Digital Fasting' : 
                 viewMode === 'translator' ? 'Language & Translation' : 
                 viewMode === 'affirmations' ? 'Daily Affirmations' : 'Spiritual Art'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {viewMode === 'chat' && (
              <button 
                onClick={() => setUseThinking(!useThinking)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${useThinking ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <BrainCircuit className="w-3.5 h-3.5" />
                {useThinking ? 'Deep Thinking ON' : 'Standard Mode'}
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-slate-800">Pastor Elias Namanya</span>
                <span className="text-xs text-slate-500">Global Church Uganda</span>
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold border-2 border-white shadow-sm">
                EN
              </div>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-3xl mx-auto h-full">
            <AnimatePresence mode="wait">
              {viewMode === 'chat' && (
                <motion.div 
                  key="chat"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 pb-24"
                >
                  {(!currentChat || currentChat.messages.length === 0) ? (
                    <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                      <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-4">
                        <Sparkles className="w-10 h-10" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-800">How can I help you today?</h2>
                      <p className="text-slate-500 max-w-md">Select a topic below or start typing to begin your journey toward digital peace.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                        {TOPICS.map(topic => (
                          <button
                            key={topic.id}
                            onClick={() => handleSendMessage(topic.prompt)}
                            className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-indigo-500 hover:shadow-md transition-all group"
                          >
                            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 mb-3 transition-colors">
                              {topic.icon}
                            </div>
                            <div className="font-semibold text-slate-800 text-sm mb-1">{topic.title}</div>
                            <div className="text-xs text-slate-500 line-clamp-1">{topic.prompt}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    currentChat.messages.map((msg, index) => (
                      <motion.div
                        key={msg.id}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-white border border-slate-200 text-indigo-600'
                        }`}>
                          {msg.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                        </div>
                        <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                          <div className={`p-4 rounded-2xl shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-indigo-600 text-white rounded-tr-none' 
                              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                          }`}>
                            {msg.isThinking && (
                              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 border-b border-indigo-50 pb-1">
                                <BrainCircuit className="w-3 h-3" />
                                Deep Thinking Result
                              </div>
                            )}
                            <div className="prose prose-sm max-w-none prose-slate">
                              <Markdown components={{
                                p: ({children}) => <p className={`m-0 ${msg.role === 'user' ? 'text-white' : 'text-slate-700'}`}>{children}</p>,
                                strong: ({children}) => <strong className="font-bold text-indigo-500">{children}</strong>,
                                blockquote: ({children}) => <blockquote className="border-l-4 border-indigo-200 pl-4 italic my-2">{children}</blockquote>
                              }}>
                                {msg.content}
                              </Markdown>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1.5 font-medium uppercase tracking-widest">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </motion.div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shrink-0">
                        <Bot className="w-6 h-6" />
                      </div>
                      <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                        </div>
                        {useThinking && <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Deep Thinking...</span>}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </motion.div>
              )}

              {viewMode === 'scripture' && (
                <motion.div 
                  key="scripture"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Scripture Search</h2>
                        <p className="text-sm text-slate-500">Find the perfect verse for any situation using Google Search data.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mb-8">
                      <input 
                        type="text" 
                        value={scriptureQuery}
                        onChange={(e) => setScriptureQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleScriptureSearch()}
                        placeholder="Search for verses about 'strength', 'peace', 'forgiveness'..."
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      />
                      <button 
                        onClick={handleScriptureSearch}
                        disabled={isSearchingScripture || !scriptureQuery.trim()}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSearchingScripture ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        Search
                      </button>
                    </div>

                    {scriptureResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl prose prose-slate max-w-none"
                      >
                        <Markdown>{scriptureResult}</Markdown>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {viewMode === 'prayer' && (
                <motion.div 
                  key="prayer"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
                        <Heart className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Prayer Room</h2>
                        <p className="text-sm text-slate-500">Submit a request or engage in a guided prayer session with Shepherd.</p>
                      </div>
                    </div>
                    
                    <div className="relative mb-4">
                      <textarea 
                        value={prayerRequest}
                        onChange={(e) => setPrayerRequest(e.target.value)}
                        placeholder="What is on your heart today? Share your prayer request..."
                        className="w-full h-40 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                      />
                      <button
                        onClick={toggleListening}
                        className={`absolute right-3 bottom-3 p-2 rounded-full transition-all ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    </div>

                    <div className="mb-6">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Prayer Templates</p>
                      <div className="flex flex-wrap gap-2">
                        {PRAYER_TEMPLATES.map(template => (
                          <button
                            key={template.id}
                            onClick={() => setPrayerRequest(template.prompt)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 hover:border-indigo-500 hover:bg-indigo-50 transition-all"
                          >
                            {template.icon}
                            {template.title}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <button 
                      onClick={handlePrayerRequest}
                      disabled={isPraying || !prayerRequest.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                    >
                      {isPraying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      Engage in Prayer
                    </button>

                    {prayerResponse && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8 p-6 bg-white border border-slate-200 rounded-2xl prose prose-slate max-w-none shadow-sm"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4">
                          <BrainCircuit className="w-3 h-3" />
                          Deeply Considered Prayer
                        </div>
                        <Markdown>{prayerResponse}</Markdown>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {viewMode === 'gallery' && (
                <motion.div 
                  key="gallery"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Spiritual Art</h2>
                        <p className="text-sm text-slate-500">Generate high-quality spiritual art for meditation and reflection.</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4 mb-8">
                      <input 
                        type="text" 
                        value={imagePrompt}
                        onChange={(e) => setImagePrompt(e.target.value)}
                        placeholder="Describe the spiritual scene (e.g., 'A peaceful valley with a shepherd at sunset')..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      />
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-slate-600">Resolution:</span>
                        {(['1K', '2K', '4K'] as const).map(size => (
                          <button
                            key={size}
                            onClick={() => setImageSize(size)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${imageSize === size ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                    >
                      {isGeneratingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      Generate Art
                    </button>

                    {generatedImage && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-8 relative group"
                      >
                        <img 
                          src={generatedImage} 
                          alt="Generated Spiritual Art" 
                          className="w-full aspect-square object-cover rounded-2xl shadow-2xl"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                          <a 
                            href={generatedImage} 
                            download="spiritual-art.png"
                            className="p-4 bg-white rounded-full text-indigo-600 hover:scale-110 transition-transform"
                          >
                            <ExternalLink className="w-6 h-6" />
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {viewMode === 'fasting' && (
                <motion.div 
                  key="fasting"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <BrainCircuit className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Digital Fasting</h2>
                        <p className="text-sm text-slate-500">Temporarily disconnect from digital distractions to reconnect with God and yourself.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Loader2 className="w-5 h-5 text-indigo-600" />
                          Fasting Tools
                        </h3>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                            <span className="text-sm font-medium">Focus Timer</span>
                            <button className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-lg">Start 30m</button>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                            <span className="text-sm font-medium">Do Not Disturb</span>
                            <button className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded-lg">Enable</button>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-indigo-600" />
                          Spiritual Guidance
                        </h3>
                        <ul className="space-y-3 text-sm text-indigo-800">
                          <li className="flex gap-2">
                            <span className="font-bold">•</span>
                            "Be still, and know that I am God." (Psalm 46:10)
                          </li>
                          <li className="flex gap-2">
                            <span className="font-bold">•</span>
                            Set aside your phone for 1 hour of prayer.
                          </li>
                          <li className="flex gap-2">
                            <span className="font-bold">•</span>
                            Fast from social media for 24 hours this weekend.
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="mt-8 p-6 bg-white border border-slate-200 rounded-2xl">
                      <h3 className="font-bold text-slate-800 mb-4">Why Digital Fasting?</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Digital fasting is the intentional abstinence from digital devices and platforms for a specific period. 
                        It helps reduce mental clutter, lowers anxiety, and creates space for deep reflection and spiritual growth. 
                        By silencing the noise of the world, we can better hear the "still small voice" of God.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {viewMode === 'affirmations' && (
                <motion.div 
                  key="affirmations"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 text-center">
                    <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-6">
                      <Sun className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Daily Affirmation</h2>
                    <p className="text-slate-500 mb-8">Start your day with a scripture-anchored promise.</p>

                    {dailyAffirmation ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-8 bg-indigo-50 border border-indigo-100 rounded-3xl relative"
                      >
                        <div className="text-4xl text-indigo-200 absolute top-4 left-4 font-serif">"</div>
                        <div className="text-xl font-medium text-indigo-900 italic leading-relaxed px-6">
                          <Markdown>{dailyAffirmation}</Markdown>
                        </div>
                        <div className="text-4xl text-indigo-200 absolute bottom-4 right-4 font-serif">"</div>
                      </motion.div>
                    ) : (
                      <div className="p-12 border-2 border-dashed border-slate-100 rounded-3xl">
                        <p className="text-slate-400 italic mb-6">Your daily affirmation is waiting...</p>
                        <button 
                          onClick={generateDailyAffirmation}
                          disabled={isGeneratingAffirmation}
                          className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 mx-auto"
                        >
                          {isGeneratingAffirmation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                          Receive Today's Word
                        </button>
                      </div>
                    )}

                    {dailyAffirmation && (
                      <button 
                        onClick={generateDailyAffirmation}
                        className="mt-8 text-sm text-indigo-600 font-semibold hover:underline"
                      >
                        Refresh for another word
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {viewMode === 'translator' && (
                <motion.div 
                  key="translator"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Languages className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Language & Translation</h2>
                        <p className="text-sm text-slate-500">Translate spiritual messages and scripture into your heart language.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase px-1">Source Language</label>
                        <select 
                          value={sourceLang}
                          onChange={(e) => setSourceLang(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        >
                          {LANGUAGES.map(lang => (
                            <option key={lang.id} value={lang.id}>{lang.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase px-1">Target Language</label>
                        <select 
                          value={targetLang}
                          onChange={(e) => setTargetLang(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        >
                          {LANGUAGES.map(lang => (
                            <option key={lang.id} value={lang.id}>{lang.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <textarea 
                        value={translatorInput}
                        onChange={(e) => setTranslatorInput(e.target.value)}
                        placeholder="Enter text to translate..."
                        className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                      />
                      
                      <button 
                        onClick={handleTranslate}
                        disabled={isTranslating || !translatorInput.trim()}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                      >
                        {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
                        Translate Message
                      </button>

                      {translatorOutput && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-6 bg-indigo-50 border border-indigo-100 rounded-2xl"
                        >
                          <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                            {translatorOutput}
                          </p>
                        </motion.div>
                      )}
                    </div>

                    <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Supported Languages</h4>
                      <div className="flex flex-wrap gap-2">
                        {LANGUAGES.map(lang => (
                          <span key={lang.id} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-600">
                            {lang.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chat Input Area (Only visible in chat mode) */}
        {viewMode === 'chat' && (
          <div className="p-4 sm:p-8 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent absolute bottom-0 left-0 right-0">
            <div className="max-w-3xl mx-auto relative">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <button
                  onClick={toggleListening}
                  className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={useThinking ? "Ask a complex theological question..." : "Message Elias' Assistant..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-slate-700 placeholder:text-slate-400"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !input.trim()}
                  className={`p-3 rounded-xl transition-all ${
                    isLoading || !input.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
