"use client";

import { useState, useEffect, useRef } from "react";
import { useLazyQuery } from "@apollo/client";
import { Send, Loader2, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { ASK_GEMINI, EXPLAIN_DEPENDENCY_GRAPH } from "@/lib/graphql/queries";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface GeminiChatProps {
    packageId?: string;
    onClose?: () => void;
}

export function GeminiChat({ packageId, onClose }: GeminiChatProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content: "Hello! I'm your AI assistant powered by Gemini. Ask me anything about dependencies or the graph.",
            timestamp: new Date(),
        },
    ]);
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [askGemini, { loading: askLoading }] = useLazyQuery(ASK_GEMINI);
    const [explainGraph, { loading: explainLoading }] = useLazyQuery(EXPLAIN_DEPENDENCY_GRAPH);

    const loading = askLoading || explainLoading;

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: inputValue,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputValue("");

        try {
            const { data } = await askGemini({
                variables: {
                    question: userMsg.content,
                    contextPackages: packageId ? [packageId] : [],
                },
            });

            if (data?.askGemini) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: data.askGemini,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, aiMsg]);
            }
        } catch (error) {
            console.error("Gemini error:", error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "Sorry, I encountered an error connecting to Gemini. Please try again.",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        }
    };

    const handleExplainGraph = async () => {
        if (!packageId || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: `Explain the dependency graph for ${packageId}`,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);

        try {
            const { data } = await explainGraph({
                variables: { packageId },
            });

            if (data?.explainDependencyGraph) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: data.explainDependencyGraph,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, aiMsg]);
            }
        } catch (error) {
            console.error("Gemini error:", error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "Sorry, I encountered an error generating the explanation.",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/50 backdrop-blur-xl border-l border-white/10 w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h2 className="font-semibold text-white">Gemini Assistant</h2>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-800 text-slate-200 border border-white/5"
                                }`}
                        >
                            {msg.role === "assistant" ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <p>{msg.content}</p>
                            )}
                        </div>
                    </motion.div>
                ))}

                {loading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                    >
                        <div className="bg-slate-800 rounded-2xl p-3 border border-white/5 flex items-center gap-2 text-slate-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Thinking...
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10 bg-slate-900/50 space-y-3">
                {packageId && (
                    <button
                        onClick={handleExplainGraph}
                        disabled={loading}
                        className="w-full text-xs py-2 px-3 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <Sparkles className="w-3 h-3" />
                        Explain this graph
                    </button>
                )}

                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                        placeholder="Ask about dependencies..."
                        className="w-full bg-slate-800 border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        disabled={loading}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || loading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
