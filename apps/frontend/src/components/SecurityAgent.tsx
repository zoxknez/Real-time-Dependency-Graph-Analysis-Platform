'use client';

/**
 * Security Agent - Autonomous AI Security Analyzer
 * 
 * Powered by Gemini 3 with:
 * - Function Calling for tool use
 * - High thinking level for complex reasoning
 * - Multi-step autonomous execution
 * 
 * Strategic Track: "The Marathon Agent"
 */

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Bot, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  Terminal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  Wrench,
  FileText,
  AlertCircle,
  Clock,
  Mic,
  ExternalLink
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentVulnerability {
  cve_id: string;
  package: string;
  severity: string;
  description: string;
  fix_version?: string;
}

interface SecurityAgentStep {
  step_number: number;
  action_type: 'FUNCTION_CALL' | 'TEXT_RESPONSE' | 'ERROR';
  tool_name?: string;
  tool_args?: string;
  tool_result?: string;
  text_response?: string;
  thought_summary?: string;
}

interface SecurityAgentResult {
  task: string;
  steps: SecurityAgentStep[];
  final_response: string;
  total_function_calls: number;
  packages_analyzed: string[];
  vulnerabilities_found: AgentVulnerability[];
  recommendations: string[];
  structured_report_json?: string | null;
  success: boolean;
  execution_time_ms: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP VISUALIZATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const AgentStepCard: React.FC<{ step: SecurityAgentStep; isExpanded: boolean; onToggle: () => void; timingMs?: number }> = ({
  step,
  isExpanded,
  onToggle,
  timingMs
}) => {
  const getStepIcon = () => {
    switch (step.action_type) {
      case 'FUNCTION_CALL':
        return <Wrench className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'TEXT_RESPONSE':
        return <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'ERROR':
        return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    }
  };

  const getStepColor = () => {
    switch (step.action_type) {
      case 'FUNCTION_CALL':
        return 'border-blue-300 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5';
      case 'TEXT_RESPONSE':
        return 'border-green-300 dark:border-green-500/30 bg-green-50/50 dark:bg-green-500/5';
      case 'ERROR':
        return 'border-red-300 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: step.step_number * 0.1 }}
      className={`border rounded-lg p-3 ${getStepColor()}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full theme-bg-secondary border theme-border text-xs font-mono theme-text-primary">
            {step.step_number}
          </span>
          {getStepIcon()}
          <span className="text-sm font-medium theme-text-primary">
            {step.action_type === 'FUNCTION_CALL' 
              ? `Tool: ${step.tool_name}` 
              : step.action_type === 'TEXT_RESPONSE'
              ? 'Agent Response'
              : 'Error'}
          </span>
        </div>
        {typeof timingMs === 'number' && (
          <span className="text-xs theme-text-secondary">{(timingMs / 1000).toFixed(2)}s</span>
        )}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 theme-text-secondary" />
        ) : (
          <ChevronDown className="w-4 h-4 theme-text-secondary" />
        )}
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 overflow-hidden"
          >
            {step.thought_summary && (
              <div className="mb-3 p-2 rounded bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Agent Thinking</span>
                </div>
                <p className="text-xs theme-text-secondary line-clamp-3">{step.thought_summary}</p>
              </div>
            )}
            
            {step.tool_args && (
              <div className="mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Arguments:</span>
                <pre className="text-xs theme-bg-primary border theme-border p-2 rounded overflow-x-auto font-mono text-blue-600 dark:text-blue-300">
                  {JSON.stringify(JSON.parse(step.tool_args), null, 2)}
                </pre>
              </div>
            )}
            
            {step.tool_result && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Result:</span>
                <pre className="text-xs theme-bg-primary border theme-border p-2 rounded overflow-x-auto font-mono text-green-600 dark:text-green-300 max-h-32 overflow-y-auto">
                  {JSON.stringify(JSON.parse(step.tool_result), null, 2)}
                </pre>
              </div>
            )}
            
            {step.text_response && (
              <div className="prose dark:prose-invert prose-sm max-w-none">
                <p className="text-sm theme-text-secondary whitespace-pre-wrap">{step.text_response}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VULNERABILITY CARD
// ═══════════════════════════════════════════════════════════════════════════════

const VulnerabilityCard: React.FC<{ vuln: AgentVulnerability }> = ({ vuln }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`border rounded-lg p-3 ${getSeverityColor(vuln.severity)}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-mono text-sm font-bold">{vuln.cve_id}</span>
        </div>
        <span className="px-2 py-0.5 rounded text-xs font-medium uppercase">
          {vuln.severity}
        </span>
      </div>
      <p className="text-xs theme-text-secondary mb-2 line-clamp-2">{vuln.description}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="theme-text-secondary">Package: <span className="theme-text-primary font-medium">{vuln.package}</span></span>
        {vuln.fix_version && (
          <span className="text-green-600 dark:text-green-400 font-medium">Fix: {vuln.fix_version}</span>
        )}
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const SecurityAgent: React.FC = () => {
  const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:8000/graphql';
  const STREAM_ENDPOINT = process.env.NEXT_PUBLIC_AGENT_STREAM_ENDPOINT || 'http://localhost:8000/agent/stream';
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SecurityAgentResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [streamMode, setStreamMode] = useState(true);
  const [stepTimings, setStepTimings] = useState<Record<number, number>>({});
  const streamStartRef = useRef<number | null>(null);

  const toggleStep = useCallback((stepNum: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepNum)) {
        next.delete(stepNum);
      } else {
        next.add(stepNum);
      }
      return next;
    });
  }, []);

  const runAgentStream = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    setResult(null);
    setExpandedSteps(new Set());
    setStepTimings({});
    streamStartRef.current = Date.now();

    try {
      const response = await fetch(STREAM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          max_steps: 10,
        })
      });

      if (!response.body) {
        throw new Error('No stream body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let currentSteps: SecurityAgentStep[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let eventType = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              data += line.replace('data:', '').trim();
            }
          }

          if (!data) continue;

          if (eventType === 'step') {
            const step = JSON.parse(data) as SecurityAgentStep;
            const elapsed = streamStartRef.current ? Date.now() - streamStartRef.current : 0;
            setStepTimings((prev) => ({ ...prev, [step.step_number]: elapsed }));
            currentSteps = [...currentSteps, step];
            setResult((prev) => ({
              task,
              steps: currentSteps,
              final_response: prev?.final_response || '',
              total_function_calls: currentSteps.filter(s => s.action_type === 'FUNCTION_CALL').length,
              packages_analyzed: prev?.packages_analyzed || [],
              vulnerabilities_found: prev?.vulnerabilities_found || [],
              recommendations: prev?.recommendations || [],
              structured_report_json: prev?.structured_report_json,
              success: prev?.success ?? true,
              execution_time_ms: prev?.execution_time_ms || 0,
            }));
          } else if (eventType === 'final') {
            const finalResult = JSON.parse(data) as SecurityAgentResult;
            setResult(finalResult);
            setExpandedSteps(new Set([finalResult.steps.length]));
          } else if (eventType === 'error') {
            setResult({
              task,
              steps: currentSteps,
              final_response: data,
              total_function_calls: currentSteps.filter(s => s.action_type === 'FUNCTION_CALL').length,
              packages_analyzed: [],
              vulnerabilities_found: [],
              recommendations: [],
              structured_report_json: null,
              success: false,
              execution_time_ms: 0,
            });
          }
        }
      }
    } catch (err) {
      console.error('Agent streaming failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, [task, isRunning, STREAM_ENDPOINT]);

  const runAgent = useCallback(async () => {
    if (!task.trim() || isRunning) return;
    
    setIsRunning(true);
    setResult(null);
    setExpandedSteps(new Set());
    
    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query SecurityAgent($input: SecurityAgentInput!) {
              securityAgent(input: $input) {
                task
                steps {
                  stepNumber
                  actionType
                  toolName
                  toolArgs
                  toolResult
                  textResponse
                  thoughtSummary
                }
                finalResponse
                totalFunctionCalls
                packagesAnalyzed
                vulnerabilitiesFound {
                  cveId
                  package
                  severity
                  description
                  fixVersion
                }
                recommendations
                structuredReportJson
                success
                executionTimeMs
              }
            }
          `,
          variables: {
            input: {
              task,
              maxSteps: 10
            }
          }
        })
      });
      
      const data = await response.json();
      
      if (data.data?.securityAgent) {
        const rawResult = data.data.securityAgent;
        // Transform snake_case to match our types
        setResult({
          task: rawResult.task,
          steps: rawResult.steps.map((s: { stepNumber: number; actionType: string; toolName?: string; toolArgs?: string; toolResult?: string; textResponse?: string; thoughtSummary?: string }) => ({
            step_number: s.stepNumber,
            action_type: s.actionType,
            tool_name: s.toolName,
            tool_args: s.toolArgs,
            tool_result: s.toolResult,
            text_response: s.textResponse,
            thought_summary: s.thoughtSummary,
          })),
          final_response: rawResult.finalResponse,
          total_function_calls: rawResult.totalFunctionCalls,
          packages_analyzed: rawResult.packagesAnalyzed,
          vulnerabilities_found: rawResult.vulnerabilitiesFound.map((v: { cveId: string; package: string; severity: string; description: string; fixVersion?: string }) => ({
            cve_id: v.cveId,
            package: v.package,
            severity: v.severity,
            description: v.description,
            fix_version: v.fixVersion,
          })),
          recommendations: rawResult.recommendations,
          structured_report_json: rawResult.structuredReportJson,
          success: rawResult.success,
          execution_time_ms: rawResult.executionTimeMs,
        });
        // Auto-expand last step
        if (rawResult.steps.length > 0) {
          setExpandedSteps(new Set([rawResult.steps.length]));
        }
      }
    } catch (err) {
      console.error('Agent execution failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, [task, isRunning, GRAPHQL_ENDPOINT]);

  const exampleTasks = [
    "Analyze npm:lodash for security vulnerabilities and provide remediation steps",
    "Check the impact radius of npm:express and identify critical dependencies",
    "Generate a security assessment for npm:axios including license compliance",
    "Find all packages with critical vulnerabilities in my project"
  ];

  return (
    <div className="min-h-screen theme-bg-primary text-gray-900 dark:text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 text-white">
              <Bot className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
              Security Agent
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Powered by Gemini 3
            </span>
            <Link
              href="/agent-live"
              className="px-2 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1"
            >
              <Mic className="w-3 h-3" />
              Live API
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <p className="theme-text-secondary text-sm">
            Autonomous AI agent for supply chain security analysis. Uses function calling 
            and advanced reasoning to analyze vulnerabilities, assess impact, and provide remediation.
          </p>
        </motion.div>

        {/* Task Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <label className="block text-sm font-medium theme-text-secondary mb-2">
            Describe your security analysis task
          </label>
          <div className="relative">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g., Analyze npm:lodash for vulnerabilities and assess the impact on my project..."
              className="w-full h-24 px-4 py-3 theme-bg-secondary border theme-border rounded-lg
                       theme-text-primary placeholder-gray-500 focus:outline-none focus:ring-1
                       focus:ring-purple-500 resize-none"
              disabled={isRunning}
            />
            <button
              onClick={streamMode ? runAgentStream : runAgent}
              disabled={!task.trim() || isRunning}
              className="absolute bottom-3 right-3 px-4 py-2 bg-gradient-to-r from-purple-600 
                       to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 
                       hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Run Agent
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs theme-text-secondary">
            <input
              id="stream-mode"
              type="checkbox"
              checked={streamMode}
              onChange={(e) => setStreamMode(e.target.checked)}
              className="accent-purple-500"
            />
            <label htmlFor="stream-mode">Live streaming steps</label>
          </div>
          
          {/* Example Tasks */}
          <div className="mt-3 flex flex-wrap gap-2">
            {exampleTasks.map((example, i) => (
              <button
                key={i}
                onClick={() => setTask(example)}
                disabled={isRunning}
                className="px-3 py-1 text-xs theme-pill hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {example.slice(0, 50)}...
              </button>
            ))}
          </div>
        </motion.div>

        {/* Running Indicator */}
        <AnimatePresence>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-6 p-4 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Brain className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-purple-500/30 rounded-full blur-md"
                  />
                </div>
                <div>
                  <p className="font-medium text-purple-700 dark:text-purple-300">Agent is thinking...</p>
                  <p className="text-sm theme-text-secondary">
                    Using Gemini 3 with high thinking level and function calling
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                <div className="flex items-center gap-2 mb-1">
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-xs theme-text-secondary">Status</span>
                </div>
                <p className={`text-lg font-bold ${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {result.success ? 'Success' : 'Failed'}
                </p>
              </div>
              
              <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                <div className="flex items-center gap-2 mb-1">
                  <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs theme-text-secondary">Tool Calls</span>
                </div>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{result.total_function_calls}</p>
              </div>
              
              <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs theme-text-secondary">Vulnerabilities</span>
                </div>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{result.vulnerabilities_found.length}</p>
              </div>
              
              <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs theme-text-secondary">Duration</span>
                </div>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {(result.execution_time_ms / 1000).toFixed(1)}s
                </p>
              </div>
            </div>

            {/* Vulnerabilities Found */}
            {result.vulnerabilities_found.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 theme-text-primary">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  Vulnerabilities Found ({result.vulnerabilities_found.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.vulnerabilities_found.map((vuln, i) => (
                    <VulnerabilityCard key={i} vuln={vuln} />
                  ))}
                </div>
              </div>
            )}

            {/* Agent Steps */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 theme-text-primary">
                <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Agent Execution Steps ({result.steps.length})
              </h3>
              <div className="space-y-2">
                {result.steps.map((step) => (
                  <AgentStepCard
                     key={step.step_number}
                     step={step}
                     isExpanded={expandedSteps.has(step.step_number)}
                     onToggle={() => toggleStep(step.step_number)}
                     timingMs={stepTimings[step.step_number]}
                  />
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 theme-text-primary">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  Recommendations
                </h3>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm theme-text-primary">{rec}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}

            {/* Final Response */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 theme-text-primary">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Agent Analysis
              </h3>
              <div className="p-4 rounded-lg theme-bg-secondary border theme-border prose dark:prose-invert max-w-none">
                <div className="text-sm theme-text-secondary whitespace-pre-wrap">
                  {result.final_response}
                </div>
              </div>
            </div>

            {/* Structured Report */}
            {result.structured_report_json && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 theme-text-primary">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Structured Report (JSON)
                </h3>
                <div className="p-4 rounded-lg theme-bg-secondary border theme-border">
                  <pre className="text-xs text-purple-700 dark:text-purple-200 overflow-x-auto">
                    {result.structured_report_json}
                  </pre>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SecurityAgent;
