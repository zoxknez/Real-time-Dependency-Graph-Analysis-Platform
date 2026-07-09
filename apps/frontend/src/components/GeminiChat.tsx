"use client";

import { useState, useEffect, useRef } from "react";
import { useLazyQuery } from "@apollo/client/react";
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

    const [askGemini, { loading: askLoading }] = useLazyQuery<
        { askGemini: string },
        { question: string; contextPackages: string[] }
    >(ASK_GEMINI);
    const [explainGraph, { loading: explainLoading }] = useLazyQuery<
        { explainDependencyGraph: string },
        { packageId: string }
    >(EXPLAIN_DEPENDENCY_GRAPH);

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

            const answer = data?.askGemini;
            if (answer) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: answer,
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

            const explanation = data?.explainDependencyGraph;
            if (explanation) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: explanation,
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
        <div className="flex flex-col h-full theme-bg-secondary backdrop-blur-xl border-l theme-border w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b theme-border theme-bg-primary">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h2 className="font-semibold theme-text-primary">Gemini Assistant</h2>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
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
                                : "theme-bg-primary theme-text-primary border theme-border"
                                }`}
                        >
                            {msg.role === "assistant" ? (
                                <div className="prose dark:prose-invert prose-sm max-w-none">
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
                        <div className="theme-bg-primary rounded-2xl p-3 border theme-border flex items-center gap-2 theme-text-secondary text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Thinking...
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t theme-border theme-bg-primary space-y-3">
                {packageId && (
                    <button
                        onClick={handleExplainGraph}
                        disabled={loading}
                        className="w-full text-xs py-2 px-3 rounded-lg border border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2"
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
                        className="w-full theme-bg-secondary border theme-border rounded-xl pl-4 pr-12 py-3 text-sm theme-text-primary placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
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
