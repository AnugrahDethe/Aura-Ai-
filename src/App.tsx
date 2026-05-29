import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './index.css';

// Type declaration for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface Message {
  text: string;
  isUser: boolean;
  isError: boolean | undefined;
}

export default function App() {
  const [isTalking, setIsTalking] = useState(false);
  const [thinkIdx, setThinkIdx] = useState(0);
  const [inputText, setInputText] = useState('');
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'chats' | 'history'>('home');
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [signupPasswordVisible, setSignupPasswordVisible] = useState(false);
  const [signupConfirmVisible, setSignupConfirmVisible] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');

  const [token, setToken] = useState(localStorage.getItem('aura_token') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('aura_token'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPasswordVal, setSignupPasswordVal] = useState('');
  const [spokenText, setSpokenText] = useState('');
  const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('aura_lang') || 'en-US');

  const LANGUAGES = [
    { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
    { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
    { code: 'hi-IN', label: 'Hindi', flag: '🇮🇳' },
    { code: 'fr-FR', label: 'French', flag: '🇫🇷' },
    { code: 'de-DE', label: 'German', flag: '🇩🇪' },
    { code: 'es-ES', label: 'Spanish', flag: '🇪🇸' },
    { code: 'ja-JP', label: 'Japanese', flag: '🇯🇵' },
    { code: 'zh-CN', label: 'Chinese', flag: '🇨🇳' },
    { code: 'ar-SA', label: 'Arabic', flag: '🇸🇦' },
    { code: 'pt-BR', label: 'Portuguese', flag: '🇧🇷' },
  ];

  // --- Web Action Engine ---
  const executeWebAction = useCallback((text: string): string | null => {
    const t = text.toLowerCase().trim();

    // YouTube: "play python tutorial on youtube" / "search python on youtube"
    const ytMatch = t.match(/(?:play|search|find|show)\s+(.+?)\s+(?:on\s+)?(?:youtube|yt)/) ||
                    t.match(/(?:youtube|yt)\s+(?:play|search|find)\s+(.+)/) ||
                    t.match(/(?:play|search)\s+(.+?)\s+video/);
    if (ytMatch) {
      const query = encodeURIComponent(ytMatch[1].trim());
      window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
      return `Opening YouTube and searching for "${ytMatch[1].trim()}".`;
    }

    // Open specific website
    const openMatch = t.match(/^(?:open|go to|launch|visit)\s+(.+)/);
    if (openMatch) {
      const site = openMatch[1].trim().replace(/\s+/g, '');
      const siteMap: Record<string, string> = {
        youtube: 'https://youtube.com',
        google: 'https://google.com',
        github: 'https://github.com',
        instagram: 'https://instagram.com',
        twitter: 'https://twitter.com',
        x: 'https://x.com',
        facebook: 'https://facebook.com',
        linkedin: 'https://linkedin.com',
        whatsapp: 'https://web.whatsapp.com',
        gmail: 'https://mail.google.com',
        maps: 'https://maps.google.com',
        netflix: 'https://netflix.com',
        spotify: 'https://open.spotify.com',
        amazon: 'https://amazon.in',
        flipkart: 'https://flipkart.com',
        reddit: 'https://reddit.com',
        stackoverflow: 'https://stackoverflow.com',
        chatgpt: 'https://chat.openai.com',
      };
      const url = siteMap[site] || (site.includes('.') ? `https://${site}` : `https://${site}.com`);
      window.open(url, '_blank');
      return `Opening ${openMatch[1].trim()} for you!`;
    }

    // Google search: "search for python tutorials" / "google machine learning"
    const googleMatch = t.match(/^(?:search(?:\s+for)?|google|find(?:\s+me)?)\s+(.+)/);
    if (googleMatch) {
      const query = encodeURIComponent(googleMatch[1].trim());
      window.open(`https://www.google.com/search?q=${query}`, '_blank');
      return `Searching Google for "${googleMatch[1].trim()}".`;
    }

    return null;
  }, []);

  const orbContainerRef = useRef<HTMLDivElement>(null);
  const statusTextRef = useRef<HTMLParagraphElement>(null);
  const recognitionRef = useRef<any>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const thinkingStates = ['Aura AI is thinking', 'Processing data', 'Connecting neural links'];

  const fetchHistory = async (authToken: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/history`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const history = response.data.messages;
      const parsedChat = history.map((msg: any) => ({ text: msg.text, isUser: msg.isUser, isError: false }));
      setChatMessages(parsedChat);
      setVoiceMessages(parsedChat);
    } catch (err: any) {
      // 422 means the stored token is invalid/expired — clear it so the user can log in fresh
      if (err?.response?.status === 422 || err?.response?.status === 401) {
        localStorage.removeItem('aura_token');
        setToken('');
        setIsLoggedIn(false);
      }
      console.error("Failed to fetch history", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchHistory(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: loginEmail,
        password: loginPassword
      });
      const newToken = response.data.token;
      localStorage.setItem('aura_token', newToken);
      setToken(newToken);
      setIsLoggedIn(true);
      setShowLogin(false);
    } catch (err) {
      console.error("Login failed", err);
      alert("Invalid email or password");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupPasswordVal) return;
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/signup`, {
        fullName: signupFullName,
        email: signupEmail,
        password: signupPasswordVal
      });
      const newToken = response.data.token;
      localStorage.setItem('aura_token', newToken);
      setToken(newToken);
      setIsLoggedIn(true);
      setShowSignup(false);
    } catch (err) {
      console.error("Signup failed", err);
      alert("Error creating account");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aura_token');
    setToken('');
    setIsLoggedIn(false);
    setChatMessages([]);
    setVoiceMessages([]);
  };

  // Load voices eagerly — Chrome loads them async
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoicesLoaded(true);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Cycle thinking states every 4s when not talking
  useEffect(() => {
    if (isTalking) return;
    const interval = setInterval(() => {
      setThinkIdx((prev) => (prev + 1) % thinkingStates.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isTalking]);

  // Mouse-follow parallax on background orbs
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const orbs = document.querySelectorAll<HTMLElement>('.orb-glow');
      const x = (e.clientX - window.innerWidth / 2) / 40;
      const y = (e.clientY - window.innerHeight / 2) / 40;
      orbs.forEach((orb, i) => {
        const factor = (i + 1) * 0.8;
        orb.style.transform = `translate(calc(-50% + ${x * factor}px), calc(-50% + ${y * factor}px))`;
      });
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, []);

  // Toggle orb container classes based on state
  useEffect(() => {
    if (orbContainerRef.current) {
      if (isTalking || isListening) {
        orbContainerRef.current.classList.remove('thinking');
        orbContainerRef.current.classList.add('talking');
      } else {
        orbContainerRef.current.classList.remove('talking');
        orbContainerRef.current.classList.add('thinking');
      }
    }
  }, [isTalking, isListening]);

  // Update status text
  useEffect(() => {
    if (statusTextRef.current) {
      if (isListening) {
        statusTextRef.current.textContent = 'Listening...';
      } else if (isTalking) {
        statusTextRef.current.textContent = 'Aura is speaking...';
      } else {
        statusTextRef.current.textContent = thinkingStates[thinkIdx];
      }
    }
  }, [isTalking, isListening, thinkIdx]);

  const speakResponse = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('speechSynthesis not supported');
      setIsTalking(false);
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Pick a voice matching the selected language
    const voices = window.speechSynthesis.getVoices();
    const langCode = selectedLang.split('-')[0];
    const preferredVoice =
      voices.find(v => v.lang === selectedLang) ||
      voices.find(v => v.lang.startsWith(langCode) && v.name.toLowerCase().includes('female')) ||
      voices.find(v => v.lang.startsWith(langCode) && v.name.toLowerCase().includes('google')) ||
      voices.find(v => v.lang.startsWith(langCode)) ||
      voices[0];

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    // Clear any previous word timers
    wordTimersRef.current.forEach(t => clearTimeout(t));
    wordTimersRef.current = [];

    const words = text.split(' ');
    const msPerWord = Math.round(60000 / (170 * utterance.rate));

    utterance.onstart = () => {
      setIsTalking(true);
      setSpokenText('');
      // Start word-by-word reveal in sync with actual speech
      let accumulated = '';
      wordTimersRef.current.forEach(t => clearTimeout(t));
      wordTimersRef.current = [];
      words.forEach((word, i) => {
        const t = setTimeout(() => {
          accumulated += (i === 0 ? '' : ' ') + word;
          setSpokenText(accumulated);
        }, i * msPerWord);
        wordTimersRef.current.push(t);
      });
    };
    utterance.onend = () => {
      setIsTalking(false);
      setSpokenText(text);
      wordTimersRef.current.forEach(t => clearTimeout(t));
    };
    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsTalking(false);
      setSpokenText(text);
      wordTimersRef.current.forEach(t => clearTimeout(t));
    };

    // Chrome workaround: delay speak slightly
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  }, [selectedLang]);

  const sendMessage = useCallback(async (textParam?: string, shouldSpeak: boolean = true, isVoiceMessage: boolean = false) => {
    const textToSend = (textParam || inputText).trim();
    if (!textToSend) return;

    const messageSetter = isVoiceMessage ? setVoiceMessages : setChatMessages;
    messageSetter(prev => [...prev, { text: textToSend, isUser: true }]);
    if (!textParam) setInputText('');

    // Check for web action first (open apps, play YouTube, search Google)
    const actionResult = executeWebAction(textToSend);
    if (actionResult) {
      messageSetter(prev => [...prev, { text: actionResult, isUser: false, isError: false }]);
      if (shouldSpeak) speakResponse(actionResult);
      return;
    }

    if (shouldSpeak) setIsTalking(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/chat`, {
        message: textToSend,
      }, {
        timeout: 15000,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const aiResponse = response.data.response;
      messageSetter(prev => [...prev, { text: aiResponse, isUser: false }]);
      if (shouldSpeak) speakResponse(aiResponse);
    } catch (error: any) {
      console.error('Error sending message:', error);
      // 422 = invalid/expired token. Clear it and retry without auth.
      if (error?.response?.status === 422) {
        localStorage.removeItem('aura_token');
        setToken('');
        setIsLoggedIn(false);
        try {
          const retry = await axios.post(`${API_BASE_URL}/chat`, { message: textToSend }, { timeout: 15000 });
          const aiResponse = retry.data.response;
          messageSetter(prev => [...prev, { text: aiResponse, isUser: false }]);
          if (shouldSpeak) speakResponse(aiResponse);
          return;
        } catch { /* fall through to error display */ }
      }
      const errMsg = error?.response?.data?.error || 'Error connecting to the AI core. Please check the backend is running.';
      const voiceMsg = error?.response?.data?.voice_message || errMsg;
      messageSetter(prev => [...prev, { text: errMsg, isUser: false, isError: true }]);
      if (shouldSpeak) speakResponse(voiceMsg);
      if (shouldSpeak) setIsTalking(false);
    }
  }, [inputText, speakResponse, token, executeWebAction]);

  // Small password strength helper component
  function PasswordStrength({ password }: { password: string }) {
    const score = (() => {
      let s = 0;
      if (!password) return 0;
      if (password.length >= 8) s += 1;
      if (password.length >= 12) s += 1;
      if (/[A-Z]/.test(password)) s += 1;
      if (/[0-9]/.test(password)) s += 1;
      if (/[^A-Za-z0-9]/.test(password)) s += 1;
      return s;
    })();

    const pct = Math.round((score / 5) * 100);
    const label = score <= 1 ? 'Weak' : score <= 3 ? 'Medium' : 'Strong';
    const color = score <= 1 ? 'bg-red-500' : score <= 3 ? 'bg-yellow-400' : 'bg-green-400';

    return (
      <div className="strength-meter">
        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
          <div className={`h-2 ${color}`} style={{ width: `${pct}%`, boxShadow: '0 6px 22px rgba(0,0,0,0.25)' }}></div>
        </div>
        <div className="flex items-center justify-between mt-2 text-on-surface-variant text-xs">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      </div>
    );
  }

  const handleVoiceSend = useCallback((transcript: string) => {
    sendMessage(transcript, true, true);
  }, [sendMessage]);

  const toggleListen = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      alert('Your browser does not support Speech Recognition. Please use Chrome or Edge.');
      return;
    }

    // Unlock speech synthesis on first user interaction
    if ('speechSynthesis' in window) {
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
      window.speechSynthesis.cancel();
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // Always create a fresh recognition instance to avoid stale state
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = selectedLang;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      handleVoiceSend(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (event.error !== 'no-speech') {
        alert('Microphone error: ' + event.error);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setIsListening(false);
    }
  }, [isListening, handleVoiceSend, selectedLang]);

  return (
    <div className={`bg-gradient-to-br from-surface via-surface-dim to-surface-bright text-on-surface font-body-md h-screen selection:bg-primary-container selection:text-on-primary-container ${isTalking ? 'is-talking' : ''}`}>
      {/* Ambient Aura Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] bg-orb-1"></div>
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[120px] bg-orb-2"></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-inverse-primary/10 rounded-full blur-[100px] bg-orb-3"></div>
        <div className="absolute top-[10%] left-[30%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-[80px] bg-orb-4"></div>
        <div className="absolute bottom-[20%] right-[20%] w-[35%] h-[35%] bg-secondary/5 rounded-full blur-[90px] bg-orb-5"></div>
        <div className="absolute top-[60%] left-[10%] w-[25%] h-[25%] bg-tertiary/5 rounded-full blur-[70px] bg-orb-6"></div>
      </div>

      <div className="flex h-full">
        {/* Side Navigation Bar */}
        <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col z-40 bg-surface/10 backdrop-blur-xl border-r border-white/10 shadow-[0px_0px_30px_rgba(0,245,255,0.1)] pt-8 px-base pb-md overflow-y-auto">
          <div className="mb-lg px-base flex items-center gap-sm">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_15px_rgba(0,245,255,0.3)]">
              <span className="material-symbols-outlined text-surface">graphic_eq</span>
            </div>
            <div>
              <h2 className="font-headline-md text-body-lg font-bold text-primary tracking-wide">Aura Assistant</h2>
              <p className="text-on-surface-variant text-[10px] uppercase tracking-widest opacity-80 mt-1">Premium Tier</p>
            </div>
          </div>
          <nav className="flex-1 space-y-base">
            <div
              onClick={() => setActiveTab('home')}
              className={`pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-base ${activeTab === 'home' ? 'text-primary font-bold border-l-2 border-primary' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined">graphic_eq</span>
              <span className="font-body-md text-body-md">Voice Core</span>
            </div>
            <div
              onClick={() => setActiveTab('chats')}
              className={`pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-base ${activeTab === 'chats' ? 'text-primary font-bold border-l-2 border-primary' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined">chat</span>
              <span className="font-body-md text-body-md">Chats</span>
            </div>
            <div
              onClick={() => setActiveTab('history')}
              className={`pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-base ${activeTab === 'history' ? 'text-primary font-bold border-l-2 border-primary' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined">history</span>
              <span className="font-body-md text-body-md">History</span>
            </div>
            <div className="text-on-surface-variant pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer duration-300 ease-in-out flex items-center gap-base">
              <span className="material-symbols-outlined">explore</span>
              <span className="font-body-md text-body-md">Explore</span>
            </div>
          </nav>
          {/* Language Selector */}
          <div className="mt-4 px-2">
            <div className="flex items-center gap-2 mb-2 px-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">language</span>
              <span className="text-on-surface-variant text-[11px] uppercase tracking-widest font-bold">Language</span>
            </div>
            <select
              value={selectedLang}
              onChange={(e) => {
                setSelectedLang(e.target.value);
                localStorage.setItem('aura_lang', e.target.value);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-on-surface text-sm outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code} className="bg-[#0f1115] text-white">
                  {l.flag} {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-auto space-y-md">
            <button className="w-full py-base px-md rounded-xl bg-gradient-to-r from-primary-container to-secondary text-on-primary font-bold shadow-[0px_0px_20px_rgba(0,245,255,0.3)] hover:opacity-90 transition-opacity">
              Upgrade Power
            </button>
            {isLoggedIn && (
              <div className="pt-base border-t border-white/10">
                <div className="text-on-surface-variant pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-base">
                  <span className="material-symbols-outlined">help</span>
                  <span className="font-body-md">Help</span>
                </div>
                <div onClick={handleLogout} className="text-on-surface-variant pl-4 py-2 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-base">
                  <span className="material-symbols-outlined">logout</span>
                  <span className="font-body-md">Logout</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative flex flex-col md:pl-64 overflow-hidden">
          {/* Top Navigation Bar */}
          <div className="absolute top-0 right-0 z-30 flex items-center gap-3 p-4 md:gap-5 md:p-6">
            {!isLoggedIn && (
              <button onClick={() => setShowLogin(true)} className="px-4 md:px-6 py-1.5 rounded-full border border-[#005f63] text-[#00f5ff] text-xs md:text-sm font-bold tracking-wider hover:bg-[#00f5ff]/10 transition-colors">
                LOGIN
              </button>
            )}
            <button className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-[24px] md:text-[28px]">account_circle</span>
            </button>
          </div>

          {/* Login Modal */}
          {showLogin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="modal-backdrop absolute inset-0 bg-black/60" onClick={() => setShowLogin(false)}></div>
              <div className="login-modal relative bg-[#0f1115] p-10 rounded-3xl w-[400px] max-w-[92%] border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-60">
                <div className="text-center mb-10">
                  <h2 className="text-[28px] font-bold text-white mb-2">Welcome Back</h2>
                  <p className="text-on-surface-variant text-body-md">Access your aetheric workspace.</p>
                </div>
                <form className="space-y-8" onSubmit={handleLogin}>
                  <div>
                    <label className="text-on-surface-variant text-sm font-bold block mb-4">Email Address</label>
                    <div className="relative flex items-center border-b border-white/10 focus-within:border-primary transition-colors pb-3">
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="w-full bg-transparent border-none outline-none text-on-surface placeholder:text-white/20 font-body-md" placeholder="name@example.com" />
                      <span className="material-symbols-outlined text-white/30 absolute right-0">mail</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-on-surface-variant text-sm font-bold block">Password</label>
                      <button type="button" className="text-[#00f5ff] text-sm font-bold hover:underline">Forgot Password?</button>
                    </div>
                    <div className="relative flex items-center border-b border-white/10 focus-within:border-primary transition-colors pb-3">
                      <input
                        type={loginPasswordVisible ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className={`w-full bg-transparent border-none outline-none text-on-surface placeholder:text-white/20 font-body-md text-lg ${!loginPasswordVisible ? 'tracking-[0.3em]' : 'tracking-normal'}`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setLoginPasswordVisible(!loginPasswordVisible)}
                        className="material-symbols-outlined text-white/30 absolute right-0 hover:text-white/70 transition-colors cursor-pointer"
                      >
                        {loginPasswordVisible ? 'visibility_off' : 'visibility'}
                      </button>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-secondary text-[#002021] font-medium text-[17px] hover:opacity-90 transition-opacity">Login</button>
                  </div>
                  <div className="text-center mt-2">
                    <p className="text-on-surface-variant text-sm font-medium">
                      New to Aura? <button type="button" onClick={() => { setShowLogin(false); setShowSignup(true); }} className="text-[#00f5ff] font-bold hover:underline">Create Account</button>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Signup Modal */}
          {showSignup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="modal-backdrop absolute inset-0 bg-black/60" onClick={() => setShowSignup(false)}></div>
              <div className="login-modal relative bg-[#0f1115] p-10 rounded-3xl w-[400px] max-w-[92%] border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-60">
                <div className="text-left mb-8">
                  <h2 className="text-[30px] font-bold text-white mb-2 tracking-tight">Create Your Aura</h2>
                  <p className="text-on-surface-variant text-[15px] pr-4 leading-relaxed">Step into the next evolution of human-machine harmony.</p>
                </div>

                <form className="space-y-7" onSubmit={handleSignup}>
                  <div>
                    <label className="text-on-surface-variant text-[11px] font-bold block mb-2 uppercase tracking-widest">Full Name</label>
                    <div className="relative flex items-center border-b border-white/10 focus-within:border-primary transition-colors pb-3">
                      <span className="material-symbols-outlined text-white/40 absolute left-0 text-[20px]">person</span>
                      <input type="text" value={signupFullName} onChange={(e) => setSignupFullName(e.target.value)} required className="w-full bg-transparent border-none outline-none text-on-surface placeholder:text-white/20 font-body-md pl-9" placeholder="Janus Spark" />
                    </div>
                  </div>

                  <div>
                    <label className="text-on-surface-variant text-[11px] font-bold block mb-2 uppercase tracking-widest">Email Architecture</label>
                    <div className="relative flex items-center border-b border-white/10 focus-within:border-primary transition-colors pb-3">
                      <span className="text-white/40 absolute left-0 text-[18px] font-bold pl-1">@</span>
                      <input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="w-full bg-transparent border-none outline-none text-on-surface placeholder:text-white/20 font-body-md pl-9" placeholder="nexus@aura-ai.tech" />
                    </div>
                  </div>

                  <div>
                    <label className="text-on-surface-variant text-[11px] font-bold block mb-2 uppercase tracking-widest">Secure Cipher</label>
                    <div className="relative flex items-center border-b border-white/10 focus-within:border-primary transition-colors pb-3">
                      <span className="material-symbols-outlined text-white/40 absolute left-0 text-[20px]">lock</span>
                      <input
                        type={signupPasswordVisible ? "text" : "password"}
                        value={signupPasswordVal}
                        onChange={(e) => setSignupPasswordVal(e.target.value)}
                        required
                        className={`w-full bg-transparent border-none outline-none text-on-surface placeholder:text-white/20 font-body-md text-lg pl-9 ${!signupPasswordVisible ? 'tracking-[0.3em]' : 'tracking-normal'}`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setSignupPasswordVisible(!signupPasswordVisible)}
                        className="material-symbols-outlined text-white/30 absolute right-0 hover:text-white/70 transition-colors cursor-pointer text-xl"
                      >
                        {signupPasswordVisible ? 'visibility' : 'visibility_off'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button type="submit" className="w-full py-4 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#b388ff] text-[#002021] font-medium text-[16px] shadow-[0_0_20px_rgba(0,245,255,0.2)] hover:opacity-90 transition-opacity">Create Now</button>
                  </div>

                  <div className="flex items-center gap-4 mt-8">
                    <hr className="flex-1 border-white/5" />
                    <span className="text-white/30 text-[10px] font-bold tracking-widest uppercase">Or Sync Via</span>
                    <hr className="flex-1 border-white/5" />
                  </div>

                  <div className="flex gap-4 mt-6">
                    <button type="button" className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center gap-3 hover:bg-white/10 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-[18px] h-[18px]">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      <span className="text-white text-[13px] font-bold">Google</span>
                    </button>
                    <button type="button" className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center gap-3 hover:bg-white/10 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="w-[18px] h-[18px] fill-white">
                        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                      </svg>
                      <span className="text-white text-[13px] font-bold">Apple</span>
                    </button>
                  </div>

                  <div className="text-center mt-6">
                    <p className="text-on-surface-variant/70 text-[10px] leading-[1.6]">
                      By synthesizing an account, you agree to our <a href="#" className="text-[#00f5ff] font-bold hover:underline">Neural Terms</a><br />
                      and <a href="#" className="text-[#00f5ff] font-bold hover:underline">Privacy Protocol</a>.
                    </p>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center w-full h-full px-4 pb-16 md:pb-0">

            {/* Voice Core Tab */}
            {activeTab === 'home' && (
              <div className="flex flex-col items-center justify-center gap-0 w-full h-full px-4">
                {/* Hero AI Orb Section */}
                <div
                  ref={orbContainerRef}
                  className="relative group cursor-pointer thinking"
                  id="orb-container"
                  onClick={toggleListen}
                >
                  {/* Outer Glow Orbs */}
                  <div className="orb-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-80 md:h-80 bg-primary/40 rounded-full"></div>
                  <div className="orb-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 md:w-96 md:h-96 bg-secondary/30 rounded-full delay-700"></div>

                  {/* Animated Waves Container */}
                  <div className="absolute inset-0 z-0">
                    <div className="wave-ring" style={{ animationDelay: '0s' }}></div>
                    <div className="wave-ring" style={{ animationDelay: '1s' }}></div>
                    <div className="wave-ring" style={{ animationDelay: '2s' }}></div>
                  </div>

                  {/* Main Animated Orb */}
                  <div className="relative w-44 h-44 md:w-64 md:h-64 rounded-full overflow-hidden p-1 shadow-[0px_0px_60px_rgba(0,245,255,0.4)] z-10 transition-transform duration-500 hover:scale-105">
                    <div className="ai-orb-inner w-full h-full rounded-full"></div>
                    {/* Internal Glass Layer */}
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[24px] rounded-full m-2 border border-white/20"></div>
                  </div>

                  {/* Voice Visualizer */}
                  <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-xs h-10 z-20">
                    <div className="voice-wave w-1 bg-primary rounded-full" style={{ animationDelay: '0.1s' }}></div>
                    <div className="voice-wave w-1 bg-primary/80 rounded-full" style={{ animationDelay: '0.3s' }}></div>
                    <div className="voice-wave w-1 bg-secondary rounded-full" style={{ animationDelay: '0.5s' }}></div>
                    <div className="voice-wave w-1 bg-primary rounded-full" style={{ animationDelay: '0.2s' }}></div>
                    <div className="voice-wave w-1 bg-primary/60 rounded-full" style={{ animationDelay: '0.4s' }}></div>
                    <div className="voice-wave w-1 bg-secondary/80 rounded-full" style={{ animationDelay: '0.1s' }}></div>
                  </div>
                </div>

                {/* Listen Button */}
                <div className="mt-12">
                  <button
                    onClick={toggleListen}
                    className={`px-md py-xs rounded-full border transition-colors flex items-center gap-base text-label-sm uppercase tracking-widest ${isListening ? 'bg-secondary/20 border-secondary/50 text-secondary animate-pulse' : isTalking ? 'bg-primary/20 border-primary/50 text-primary' : 'border-primary/30 text-primary-fixed-dim hover:bg-primary/10'}`}
                    id="toggle-state"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {isListening ? 'mic' : isTalking ? 'volume_up' : 'mic_none'}
                    </span>
                    <span>{isListening ? 'Stop Listening' : isTalking ? 'Speaking...' : 'Tap to Speak'}</span>
                  </button>
                </div>

                <div className="mt-lg text-center px-4">
                  <p
                    ref={statusTextRef}
                    className="font-display-lg text-base md:text-headline-md text-primary"
                    id="status-text"
                    style={{ animation: 'textFade 3s infinite ease-in-out' }}
                  >
                    {isListening ? 'Listening...' : isTalking ? 'Aura is speaking...' : thinkingStates[thinkIdx]}
                  </p>
                  <p className="text-on-surface-variant mt-base opacity-60 font-label-sm tracking-widest uppercase text-[10px] md:text-xs">
                    {isListening ? 'Say something...' : 'Analyzing biometric patterns'}
                  </p>
                </div>

                {/* Show last AI reply on home tab */}
                {voiceMessages.length > 0 && !voiceMessages[voiceMessages.length - 1].isUser && (
                  <div className="mt-6 max-w-2xl w-full mx-auto px-4 mb-8">
                    <div className={`p-5 rounded-2xl font-body-md text-center whitespace-normal ${voiceMessages[voiceMessages.length - 1].isError ? 'bg-red-900/30 border border-red-500 text-red-300 animate-error-glow' : 'bg-[#252526] shadow-lg text-[#e0e0e0] font-medium text-[17px]'}`}>
                      {isTalking && spokenText ? (
                        <>
                          <span className="text-white">{spokenText}</span>
                          <span className="text-[#a0a0a0]">{voiceMessages[voiceMessages.length - 1].text.substring(spokenText.length)}</span>
                        </>
                      ) : (
                        voiceMessages[voiceMessages.length - 1].text
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Chat Interface Tab */}
            {activeTab === 'chats' && (
              <div className="mt-14 md:mt-8 w-full max-w-3xl px-3 md:px-md flex flex-col h-full z-20 relative pb-28 md:pb-32">
                <div className="mb-4 md:mb-6">
                  <h1 className="font-headline-md text-lg md:text-headline-md text-primary tracking-wide flex items-center gap-sm">
                    <span className="material-symbols-outlined">chat</span>
                    Chat History
                  </h1>
                  <p className="text-on-surface-variant text-body-md opacity-80 mt-1 text-sm">View your recent text and voice transcripts with Aura.</p>
                </div>

                {/* Messages Display */}
                <div className="flex-1 w-full flex flex-col gap-4 overflow-y-auto pr-4 mb-4 min-h-[300px]" style={{ scrollbarWidth: 'thin' }}>
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-on-surface-variant opacity-50">
                      <span className="material-symbols-outlined text-4xl mb-2">forum</span>
                      <p>No messages yet. Start typing in the chat!</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`p-4 rounded-xl max-w-[80%] backdrop-blur-md ${msg.isUser ? 'bg-primary/20 self-end rounded-tr-none border border-primary/20' : 'bg-white/10 self-start rounded-tl-none border border-white/10'}`}>
                        <p className="text-on-surface font-body-md whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Text Input */}
                <div className="w-full flex gap-sm bg-surface-container/60 p-2 rounded-full border border-white/10 backdrop-blur-xl mt-auto">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage(undefined, false, false)}
                    placeholder="Message Aura..."
                    className="flex-1 bg-transparent border-none outline-none text-on-surface px-4 font-body-md focus:ring-0"
                  />
                  <button
                    onClick={() => sendMessage(undefined, false, false)}
                    className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(0,245,255,0.3)]"
                    title="Send Message"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            )}

            {/* History Interface Tab */}
            {activeTab === 'history' && (
              <div className="mt-8 w-full max-w-4xl px-md flex flex-col h-full z-20 relative pb-32">
                <div className="mb-6">
                  <h1 className="font-headline-md text-headline-md text-primary tracking-wide flex items-center gap-sm">
                    <span className="material-symbols-outlined">history</span>
                    Session History
                  </h1>
                  <p className="text-on-surface-variant text-body-md opacity-80 mt-1">View your complete voice and chat session history.</p>
                </div>

                {/* Voice Sessions */}
                {voiceMessages.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-primary font-headline-md text-body-lg mb-4 flex items-center gap-sm">
                      <span className="material-symbols-outlined">mic</span>
                      Voice Sessions
                    </h2>
                    <div className="space-y-3">
                      {voiceMessages.map((msg, idx) => (
                        <div key={`voice-${idx}`} className={`p-4 rounded-xl backdrop-blur-md ${msg.isUser ? 'bg-primary/20 border border-primary/20' : 'bg-white/10 border border-white/10'}`}>
                          <div className="flex items-center gap-sm mb-2">
                            <span className="material-symbols-outlined text-sm">{msg.isUser ? 'person' : 'smart_toy'}</span>
                            <span className="text-xs text-on-surface-variant opacity-70">{msg.isUser ? 'You' : 'Aura'}</span>
                          </div>
                          <p className="text-on-surface font-body-md whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat Sessions */}
                {chatMessages.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-secondary font-headline-md text-body-lg mb-4 flex items-center gap-sm">
                      <span className="material-symbols-outlined">chat</span>
                      Chat Sessions
                    </h2>
                    <div className="space-y-3">
                      {chatMessages.map((msg, idx) => (
                        <div key={`chat-${idx}`} className={`p-4 rounded-xl backdrop-blur-md ${msg.isUser ? 'bg-primary/20 border border-primary/20' : 'bg-white/10 border border-white/10'}`}>
                          <div className="flex items-center gap-sm mb-2">
                            <span className="material-symbols-outlined text-sm">{msg.isUser ? 'person' : 'smart_toy'}</span>
                            <span className="text-xs text-on-surface-variant opacity-70">{msg.isUser ? 'You' : 'Aura'}</span>
                          </div>
                          <p className="text-on-surface font-body-md whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {voiceMessages.length === 0 && chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-on-surface-variant opacity-50">
                    <span className="material-symbols-outlined text-4xl mb-2">history</span>
                    <p>No history yet. Start using Voice Core or Chats!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bottom Navigation Bar (Mobile only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 md:hidden bg-[#0a0d12]/90 backdrop-blur-2xl border-t border-white/10 shadow-[0_-4px_30px_rgba(0,0,0,0.6)]">
        <div className="flex w-full justify-around items-end py-2 px-2 pb-[env(safe-area-inset-bottom,8px)]">

          {/* Voice Core */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 ${activeTab === 'home' ? 'text-[#00f5ff]' : 'text-white/40'}`}
          >
            <span className="material-symbols-outlined text-[26px]">graphic_eq</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">Voice</span>
          </button>

          {/* Chats */}
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 ${activeTab === 'chats' ? 'text-[#00f5ff]' : 'text-white/40'}`}
          >
            <span className="material-symbols-outlined text-[26px]">chat</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">Chats</span>
          </button>

          {/* Center Mic Button */}
          <button
            onClick={toggleListen}
            className={`-mt-5 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,245,255,0.4)] transition-all duration-200 active:scale-90 ${isListening
                ? 'bg-red-500/80 border-2 border-red-400 animate-pulse'
                : isTalking
                  ? 'bg-primary/30 border-2 border-primary'
                  : 'bg-gradient-to-br from-[#00e5ff] to-[#b388ff] border-2 border-white/20'
              }`}
          >
            <span className="material-symbols-outlined text-[28px] text-[#001a1a]">
              {isListening ? 'stop' : isTalking ? 'volume_up' : 'mic'}
            </span>
          </button>

          {/* History */}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 ${activeTab === 'history' ? 'text-[#00f5ff]' : 'text-white/40'}`}
          >
            <span className="material-symbols-outlined text-[26px]">history</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">History</span>
          </button>

          {/* Account / Login */}
          <button
            onClick={() => !isLoggedIn && setShowLogin(true)}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 ${isLoggedIn ? 'text-[#00f5ff]' : 'text-white/40'}`}
          >
            <span className="material-symbols-outlined text-[26px]">{isLoggedIn ? 'account_circle' : 'login'}</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">{isLoggedIn ? 'Profile' : 'Login'}</span>
          </button>

        </div>
      </nav>

      {/* Voices not loaded warning */}
      {!voicesLoaded && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, zIndex: 9999 }}>
          Loading voices…
        </div>
      )}
    </div>
  );
}
