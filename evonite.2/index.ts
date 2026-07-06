export interface DashboardData {
  iteration: number; pending_goals: number; completed_goals: number;
  pipeline_runs: number; study_cycles: number;
  fleet: FleetSummary; experience_stats: ExperienceStats;
  skills: SkillStats; self_model: SelfModelSnapshot;
  _ts?: number; _pulse?: number;
}
export interface FleetSummary {
  active_agents: number;
  resources: { cpu_pct?: number; ram_pct?: number; };
  agents?: AgentNode[];
}
export interface AgentNode {
  id: string; role: string;
  status: "idle" | "working" | "reflecting" | "error";
  model: string; tasks_completed: number;
}
export interface ExperienceStats {
  total: number; failures: number; avg_score: number; recent: Experience[];
}
export interface Experience {
  id: string; task: string; score: number; success: boolean; timestamp: string;
}
export interface SkillStats { total: number; names: string[]; }
export interface SelfModelSnapshot {
  total_nodes: number; improvements: number;
  strengths: Array<{ name: string; strength: number }>;
  gaps: Array<{ name: string; strength: number }>;
}
export interface Goal {
  goal_id: string; description: string; priority: number; completed: boolean;
  status: "planning" | "executing" | "reflecting" | "done" | "error";
  use_pipeline?: boolean;
}
export interface ApprovalRequest {
  action: "spawn" | "skill_inject" | "code_change";
  details: Record<string, unknown>; timestamp: number;
}
