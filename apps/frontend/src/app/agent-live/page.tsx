"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { Mic, ExternalLink, Shield, Sparkles, KeyRound, CheckCircle, AlertTriangle, Send } from "lucide-react";

export default function AgentLivePage() {
  const TOKEN_ENDPOINT = process.env.NEXT_PUBLIC_LIVE_TOKEN_ENDPOINT || "http://localhost:8000/live/token";
  const LIVE_WS_ENDPOINT = process.env.NEXT_PUBLIC_LIVE_WS_ENDPOINT || "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
  const LIVE_MODEL = process.env.NEXT_PUBLIC_LIVE_MODEL || "models/gemini-2.5-flash-native-audio-preview-12-2025";
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [prompt, setPrompt] = useState("Analyze npm:lodash and summarize risks.");
  const [responses, setResponses] = useState<string[]>([]);
  const [autoSend, setAutoSend] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const presets = [
    "Analyze npm:lodash and summarize risks.",
    "Check npm:axios for critical vulnerabilities and suggest fixes.",
    "Explain the impact radius of npm:express in simple terms.",
  ];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [responses]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("agent-live-show-guide");
    if (saved === "false") {
      setShowGuide(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("agent-live-show-guide", showGuide ? "true" : "false");
  }, [showGuide]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const connectLive = () => {
    if (!token || sessionStatus === "connecting") return;
    setSessionStatus("connecting");
    setResponses([]);

    const ws = new WebSocket(`${LIVE_WS_ENDPOINT}?access_token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const setupMessage = {
        setup: {
          model: LIVE_MODEL,
          generationConfig: {
            responseModalities: ["TEXT"],
          },
          systemInstruction: {
            parts: [{ text: "You are a security analyst. Be concise." }],
          },
        },
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.setupComplete) {
          setSessionStatus("ready");
          if (autoSend) {
            sendPrompt();
            setAutoSend(false);
          }
          return;
        }
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.text) {
              setResponses((prev) => [...prev, part.text]);
            }
          }
        }
      } catch {
        // Ignore parsing errors
      }
    };

    ws.onerror = () => {
      setSessionStatus("error");
    };

    ws.onclose = () => {
      setSessionStatus("idle");
    };
  };

  const sendPrompt = () => {
    if (!wsRef.current || sessionStatus !== "ready") return;
    const message = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        turnComplete: true,
      },
    };
    wsRef.current.send(JSON.stringify(message));
  };

  const runDemoSequence = async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    setDemoStep(0);
    if (!token) {
      await fetchToken();
    }
    if (sessionStatus !== "ready") {
      setAutoSend(false);
      connectLive();
      await new Promise((r) => setTimeout(r, 1500));
    }
    let idx = 0;
    for (const p of presets) {
      setDemoStep(idx + 1);
      setPrompt(p);
      await new Promise((r) => setTimeout(r, 500));
      sendPrompt();
      await new Promise((r) => setTimeout(r, 2000));
      idx += 1;
    }
    setDemoStep(null);
    setDemoRunning(false);
  };

  const runOneClickDemo = async () => {
    await fetchToken();
    setAutoSend(true);
    connectLive();
  };

  const fetchToken = async () => {
    setLoading(true);
    setTokenError(null);
    try {
      const res = await fetch(TOKEN_ENDPOINT);
      if (!res.ok) {
        throw new Error("Token endpoint not configured");
      }
      const data = await res.json();
      setToken(data.token);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "Failed to fetch token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen theme-bg-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 text-white">
              <Mic className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold theme-text-primary">
              Live Voice Agent (Gemini Live API)
            </h1>
            <span className="px-2 py-1 text-xs rounded-full bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Hackathon Demo
            </span>
            {demoRunning && (
              <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Demo Running
              </span>
            )}
          </div>
          <p className="text-sm theme-text-secondary">
            Low-latency, real-time voice interaction powered by Gemini Live API. This optional demo uses a native audio model for streaming, while the core Security Agent uses Gemini 3 for tool calling and structured outputs.
          </p>
          {!showGuide && (
            <div className="mt-3">
              <button
                onClick={() => setShowGuide(true)}
                className="text-xs text-purple-600 dark:text-purple-300/80 hover:text-purple-800 dark:hover:text-purple-200"
              >
                Show guided demo
              </button>
            </div>
          )}
        </motion.div>

        {showGuide && (
          <div className="mb-6 p-4 rounded-2xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/50 dark:bg-purple-500/5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">Guided Demo (30s)</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="text-xs text-purple-600 dark:text-purple-300/80 hover:text-purple-800 dark:hover:text-purple-200"
              >
                Hide
              </button>
            </div>
            <ol className="text-xs text-purple-800 dark:text-purple-200/90 list-decimal list-inside space-y-1">
              <li>Fetch an ephemeral token.</li>
              <li>Run the three-step demo sequence.</li>
              <li>Watch the Live API respond in real time.</li>
            </ol>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl border theme-border theme-bg-secondary glass-card">
            <h2 className="text-lg font-semibold theme-text-primary mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" />
              Suggested Demo Flow
            </h2>
            <ol className="space-y-2 text-sm theme-text-secondary list-decimal list-inside">
              <li>Open the Live API demo in AI Studio.</li>
              <li>Ask: "Analyze npm:lodash and explain security impact."</li>
              <li>Show how the model narrates risk + mitigation in real time.</li>
              <li>Connect back to the Security Agent dashboard results.</li>
            </ol>
          </div>

          <div className="p-6 rounded-2xl border theme-border theme-bg-secondary glass-card">
            <h2 className="text-lg font-semibold theme-text-primary mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              Security-First Setup
            </h2>
            <p className="text-sm theme-text-secondary mb-4">
              For production, use **ephemeral tokens** and client-to-server streaming as recommended by
              Gemini Live API docs.
            </p>
            <div className="mb-4">
              <button
                onClick={fetchToken}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 transition-colors"
              >
                {loading ? "Fetching token..." : "Get Ephemeral Token"}
              </button>
              {token && (
                <div className="mt-3 text-xs text-green-600 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" /> Token ready for Live API demo
                </div>
              )}
              {tokenError && (
                <div className="mt-3 text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> {tokenError}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="https://aistudio.google.com/live"
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-colors"
              >
                Open Live API Demo
                <ExternalLink className="w-4 h-4" />
              </Link>
              <button
                onClick={runOneClickDemo}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 transition-colors"
              >
                One-Click Demo
                <Sparkles className="w-4 h-4" />
              </button>
              <button
                onClick={runDemoSequence}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-200 border border-green-300 dark:border-green-500/30 transition-colors"
              >
                Auto Demo (3 prompts)
                <Sparkles className="w-4 h-4" />
              </button>
              <Link
                href="https://ai.google.dev/gemini-api/docs/live"
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border theme-border theme-text-secondary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Live API Docs
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 rounded-2xl border theme-border theme-bg-secondary glass-card">
          <h2 className="text-lg font-semibold theme-text-primary mb-3 flex items-center gap-2">
            <Mic className="w-4 h-4 text-purple-500" />
            Live API Text Session (Experimental)
          </h2>
          <p className="text-sm theme-text-secondary mb-4">
            Uses a WebSocket session to the Live API. Requires a valid ephemeral token.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={connectLive}
              disabled={!token || sessionStatus === "connecting"}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
            >
              {sessionStatus === "ready" ? "Connected" : sessionStatus === "connecting" ? "Connecting..." : "Connect"}
            </button>
            <span className="text-xs theme-text-secondary">Status: {sessionStatus}</span>
          </div>
          <div className="flex gap-2 mb-4">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg theme-bg-primary theme-border theme-text-primary focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              onClick={sendPrompt}
              disabled={sessionStatus !== "ready"}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="px-2 py-1 text-xs rounded-full theme-pill hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                {p.slice(0, 36)}...
              </button>
            ))}
          </div>
          <div className="mb-3">
            <p className="text-xs theme-text-secondary mb-2">Demo Steps</p>
            <div className="flex flex-col gap-2">
              {presets.map((p, i) => (
                <div
                  key={p}
                  className={`text-xs px-3 py-2 rounded-lg border ${
                    demoStep === i + 1
                      ? "border-green-300 dark:border-green-500/40 bg-green-50/50 dark:bg-green-500/10 text-green-800 dark:text-green-200"
                      : "theme-border theme-bg-primary theme-text-secondary"
                  }`}
                >
                  Step {i + 1}: {p}
                </div>
              ))}
            </div>
          </div>
          <div
            ref={outputRef}
            className="min-h-[120px] max-h-[240px] overflow-y-auto p-3 rounded-lg theme-bg-primary theme-border theme-text-primary whitespace-pre-wrap font-mono text-xs"
          >
            {responses.length === 0 ? "Live responses will appear here..." : responses.join("")}
          </div>
          {!token && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Tip: Fetch an ephemeral token first to connect.
            </p>
          )}
        </div>

        <div className="mt-8 p-6 rounded-2xl border border-dashed border-purple-300 dark:border-purple-500/40 bg-purple-50/30 dark:bg-purple-500/5">
          <h3 className="text-base font-semibold text-purple-700 dark:text-purple-300 mb-2">Next Step (optional)</h3>
          <p className="text-sm text-purple-800 dark:text-purple-200/90">
            We can wire a full WebRTC Live API client with ephemeral token minting in the backend for a
            complete in-app voice demo. This provides the strongest wow-factor for the judges.
          </p>
        </div>
      </div>
    </div>
  );
}
