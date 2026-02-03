"use client";

import { useState, useRef, useEffect } from "react";
import { useLazyQuery } from "@apollo/client";
import { ASK_GEMINI } from "@/lib/graphql/queries";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Bot,
  Send,
  User,
  Copy,
  Check,
  RefreshCcw,
  Terminal,
  Shield,
  Zap,
  ArrowRight,
  Loader2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  {
    label: "Analyze Risks",
    icon: Shield,
    query: "What are the top security risks in the NPM ecosystem right now?"
  },
  {
    label: "Dependency Path",
    icon: Terminal,
    query: "How can I find the shortest path between express and lodash?"
  },
  {
    label: "Optimization",
    icon: Zap,
    query: "Suggest ways to optimize dependency bloat in a large React project."
  },
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [askGemini, { loading }] = useLazyQuery(ASK_GEMINI, {
    onCompleted: (data) => {
      if (data?.askGemini) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          type: "ai",
          content: data.askGemini,
          timestamp: new Date()
        }]);
      }
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleAsk = (e?: React.FormEvent, customQuery?: string) => {
    e?.preventDefault();
    const queryToSubmit = customQuery || question;

    if (!queryToSubmit.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: queryToSubmit.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setQuestion("");
    askGemini({ variables: { question: queryToSubmit.trim(), contextPackages: [] } });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white selection:bg-primary-500/30 font-sans overflow-hidden flex flex-col pt-20 pb-4">
      {/* Deep Blue Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-surface-950 to-black z-0" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 z-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 flex-1 flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-900 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Gemini 3.0
                <span className="px-2 py-0.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-[10px] text-primary-400 font-mono tracking-widest uppercase">
                  Connected
                </span>
              </h1>
              <p className="text-sm theme-text-muted flex items-center gap-2">
                Advanced Reasoning Model
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-xs theme-text-faint font-mono">v3.0.0-turbo</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setMessages([])}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-xs font-medium theme-text-muted hover:text-white transition-all flex items-center gap-2 backdrop-blur-sm group"
          >
            <RefreshCcw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
            Clear chat
          </button>
        </motion.div>

        {/* Chat Area */}
        <div className="flex-1 glass-card border-white/10 shadow-2xl overflow-hidden flex flex-col relative rounded-3xl backdrop-blur-xl bg-surface-900/60">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
          >
            {messages.length === 0 && !loading ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-10 max-w-lg mx-auto py-12">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-surface-800 to-surface-900 border border-white/10 flex items-center justify-center shadow-2xl">
                      <Sparkles className="w-10 h-10 text-primary-400" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Ready for questions</h2>
                    <p className="text-sm theme-text-tertiary max-w-xs mx-auto">
                      Ask about dependencies, risk posture, or architecture patterns.
                    </p>
                  </div>
                </motion.div>

                <div className="grid grid-cols-1 gap-3 w-full">
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <motion.button
                      key={prompt.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * idx + 0.3 }}
                      onClick={() => handleAsk(undefined, prompt.query)}
                      className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary-500/30 transition-all text-left relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-10 h-10 rounded-xl bg-surface-950 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                        <prompt.icon className="w-5 h-5 text-primary-400" />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-white mb-0.5">{prompt.label}</span>
                        <span className="text-xs theme-text-muted truncate max-w-[200px] block opacity-70">{prompt.query}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-primary-400 absolute right-4 transition-colors" />
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex gap-6",
                        msg.type === "user" ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-lg",
                        msg.type === "user"
                          ? "bg-white/10 border border-white/10"
                          : "bg-gradient-to-br from-primary-600 to-accent-600"
                      )}>
                        {msg.type === "user" ? (
                          <User className="w-5 h-5 text-white" />
                        ) : (
                          <Bot className="w-5 h-5 text-white" />
                        )}
                      </div>

                      <div className={cn(
                        "relative max-w-[85%] rounded-3xl p-6 shadow-xl backdrop-blur-md",
                        msg.type === "user"
                          ? "bg-primary-600/20 border border-primary-500/30 text-white rounded-tr-none"
                          : "bg-surface-800/80 border border-white/10 rounded-tl-none"
                      )}>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {msg.type === "ai" && (
                          <button
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            className="absolute bottom-3 right-3 p-2 rounded-lg bg-surface-950/50 hover:bg-surface-900 border border-white/5 opacity-0 group-hover:opacity-100 transition-all"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 theme-text-muted" />
                            )}
                          </button>
                        )}

                        <div className={cn(
                          "absolute -bottom-6 text-[10px] theme-text-tertiary font-mono opacity-0 group-hover:opacity-100 transition-opacity",
                          msg.type === "user" ? "right-2" : "left-2"
                        )}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.type === "user" ? "SENT" : "RECEIVED"}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-6"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-accent-600 flex items-center justify-center shrink-0 animate-pulse shadow-glow-primary">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-surface-800/80 border border-white/10 px-6 py-4 rounded-3xl rounded-tl-none flex items-center gap-4">
                      <div className="flex gap-1.5 h-4 items-center">
                        <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-[bounce_1s_infinite_-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-[bounce_1s_infinite_-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-[bounce_1s_infinite]" />
                      </div>
                      <span className="text-xs theme-text-tertiary font-medium animate-pulse">Processing response...</span>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-white/5 bg-surface-950/40 backdrop-blur-xl">
            <form
              onSubmit={handleAsk}
              className="relative flex items-end gap-3 max-w-4xl mx-auto"
            >
              <div className="relative flex-1 group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-accent-600 rounded-2xl opacity-20 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder="Ask a question..."
                  className="relative w-full bg-surface-900 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none max-h-32 transition-all min-h-[60px] shadow-inner"
                  rows={1}
                />

                <div className="absolute right-3 bottom-3">
                  <button
                    type="submit"
                    disabled={loading || !question.trim()}
                    className="p-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-white disabled:opacity-50 disabled:hover:bg-primary-500 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-3 flex items-center justify-center gap-2">
              <Shield className="w-3 h-3 theme-text-tertiary" />
              <p className="text-[10px] theme-text-muted">
                AI responses generated by Gemini 3.0. Verify critical information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
