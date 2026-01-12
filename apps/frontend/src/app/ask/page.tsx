"use client";

import { useState } from "react";
import { useLazyQuery } from "@apollo/client";
import { ASK_GEMINI } from "@/lib/graphql/queries";
import { motion } from "framer-motion";
import { Sparkles, Bot, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AskPage() {
    const [question, setQuestion] = useState("");
    const [askGemini, { data, loading, error }] = useLazyQuery(ASK_GEMINI);

    const handleAsk = (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim()) return;
        askGemini({ variables: { question, contextPackages: [] } });
    };

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
            >
                <Bot className="w-8 h-8 text-accent-400" />
                <h1 className="text-3xl font-bold theme-text-primary">Ask Gemini 3.0</h1>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Input Area */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-1 space-y-4"
                >
                    <div className="glass-card p-6">
                        <form onSubmit={handleAsk} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium theme-text-secondary mb-2">
                                    Your Question (Thinking Model)
                                </label>
                                <textarea
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-3 theme-text-primary placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-accent-500/50 resize-none"
                                    placeholder="Ask about dependencies, risks, or architecture..."
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || !question.trim()}
                                className="w-full bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-500/20"
                            >
                                {loading ? "Thinking..." : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Generate Answer
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    <div className="glass-card p-6">
                        <h3 className="text-sm font-medium theme-text-secondary mb-3">Capabilities</h3>
                        <ul className="space-y-2 text-sm theme-text-tertiary">
                            <li className="flex gap-2">
                                <span className="text-accent-400">•</span>
                                Deep reasoning about dependency graphs
                            </li>
                            <li className="flex gap-2">
                                <span className="text-accent-400">•</span>
                                Risk analysis and impact assessment
                            </li>
                            <li className="flex gap-2">
                                <span className="text-accent-400">•</span>
                                Architecture recommendations
                            </li>
                        </ul>
                    </div>
                </motion.div>

                {/* Output Area */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-2"
                >
                    <div className="glass-card p-6 min-h-[500px] flex flex-col">
                        {data?.askGemini ? (
                            <div className="prose prose-invert max-w-none">
                                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
                                    <Sparkles className="w-5 h-5 text-accent-400" />
                                    <h2 className="text-lg font-semibold theme-text-primary m-0">Gemini Response</h2>
                                </div>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {data.askGemini}
                                </ReactMarkdown>
                            </div>
                        ) : loading ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-full bg-accent-500/10 flex items-center justify-center mb-4 animate-pulse">
                                    <Sparkles className="w-8 h-8 text-accent-400" />
                                </div>
                                <h3 className="text-lg font-medium theme-text-primary">Thinking...</h3>
                                <p className="theme-text-tertiary max-w-sm mt-2">
                                    Gemini 3.0 is analyzing your request using advanced reasoning. This may take a few seconds.
                                </p>
                            </div>
                        ) : error ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-red-400">
                                <p>Error: {error.message}</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <MessageSquare className="w-12 h-12 theme-text-faint mb-4" />
                                <p className="theme-text-tertiary">Ask a question to get started</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
