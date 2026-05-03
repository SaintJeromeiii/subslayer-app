import { EventEmitter } from "node:events";

export type AgentLogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  context?: Record<string, unknown>;
};

const emitter = new EventEmitter();
const MAX_LOG_ENTRIES = 250;
const history: AgentLogEntry[] = [];

export function pushAgentLog(entry: Omit<AgentLogEntry, "id" | "timestamp">) {
  const fullEntry: AgentLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };
  history.push(fullEntry);
  if (history.length > MAX_LOG_ENTRIES) {
    history.shift();
  }
  emitter.emit("log", fullEntry);
  return fullEntry;
}

export function getAgentLogHistory(): AgentLogEntry[] {
  return [...history];
}

export function subscribeToAgentLogs(listener: (entry: AgentLogEntry) => void) {
  emitter.on("log", listener);
  return () => emitter.off("log", listener);
}
