"use client";
import { useEffect, useState, useCallback } from "react";
import { DashboardData } from "../types";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export function useSSE() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/stream`);
    es.onopen = () => { setConnected(true); setError(null); };
    es.addEventListener("dashboard", (e: Event) => {
      try { setData(JSON.parse((e as MessageEvent).data)); }
      catch { setError("Malformed SSE payload"); }
    });
    es.onerror = () => { setConnected(false); setError("Connection lost"); es.close(); };
    return () => es.close();
  }, []);
  const sendApproval = useCallback(async (action: string, approved: boolean) => {
    await fetch(`${API_BASE}/api/approve`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action, approved }),
    });
  }, []);
  const addGoal = useCallback(async (description: string, priority: number = 5) => {
    await fetch(`${API_BASE}/api/goals`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ description, priority }),
    });
  }, []);
  return { data, connected, error, sendApproval, addGoal };
}
