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
  Zap
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
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold theme-text-primary leading-tight">Gemini 3.0</h1>
            <p className="text-xs theme-text-muted">Advanced Reasoning Model</p>
          </div>
        </div>
        <button
          onClick={() => setMessages([])}
          className="p-2 rounded-lg theme-interactive text-xs flex items-center gap-2"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Clear Chat
        </button>
      </motion.div>

      {/* Chat Area */}
      <div className="flex-1 glass-card overflow-hidden flex flex-col relative">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth"
        >
          {messages.length === 0 && !loading ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 max-w-md mx-auto">
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-primary-500/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary-400" />
                </div>
                <h2 className="text-xl font-semibold theme-text-primary">How can I help you today?</h2>
                <p className="text-sm theme-text-tertiary">
                  Ask anything about your dependency graph, security risks, or architectural patterns.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 w-full">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    onClick={() => handleAsk(undefined, prompt.query)}
                    className="flex items-center gap-3 p-4 rounded-2xl theme-inner-card theme-inner-card-hover border theme-border transition-all text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center">
                      <prompt.icon className="w-4 h-4 text-accent-400" />
                    </div>
                    <span className="text-sm font-medium theme-text-secondary">{prompt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex gap-4 group",
                      msg.type === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
                      msg.type === "user" ? "bg-primary-500" : "bg-accent-500"
                    )}>
                      {msg.type === "user" ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>

                    <div className={cn(
                      "relative max-w-[85%] px-4 py-3 rounded-2xl group-hover:shadow-lg transition-all",
                      msg.type === "user"
                        ? "bg-primary-500/10 border border-primary-500/20 text-white"
                        : "theme-inner-card border theme-border"
                    )}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {msg.type === "ai" && (
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="absolute bottom-2 right-2 p-1.5 rounded-md theme-bg-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 theme-text-muted" />
                          )}
                        </button>
                      )}

                      <span className="text-[10px] theme-text-faint absolute -bottom-5 right-0">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center shrink-0 animate-pulse">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="theme-inner-card border theme-border px-4 py-3 rounded-2xl flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" />
                    </div>
                    <span className="text-xs theme-text-tertiary italic">Analyzing graph...</span>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t theme-border bg-black/5">
          <form
            onSubmit={handleAsk}
            className="relative flex items-end gap-2"
          >
            <div className="relative flex-1">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="Message Gemini..."
                className="w-full bg-surface-900/50 border theme-border rounded-2xl py-3 pl-4 pr-12 theme-text-primary placeholder:theme-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none max-h-32 transition-all min-h-[48px]"
                rows={1}
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="absolute right-2 bottom-2 p-2 rounded-xl bg-primary-500 text-white disabled:opacity-50 hover:bg-primary-600 transition-all shadow-glow"
              >
                {loading ? (
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
          <p className="text-[10px] theme-text-faint text-center mt-2">
            Gemini can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
