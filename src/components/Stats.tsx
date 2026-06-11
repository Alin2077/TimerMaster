import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CategoryStat {
  category: string;
  total: number;
}

interface TypeStat {
  task_type: string;
  total: number;
}

interface TaskStats {
  total: number;
  running: number;
  by_category: CategoryStat[];
  by_type: TypeStat[];
}

const CAT_COLORS: Record<string, string> = {
  "未分类": "var(--accent-blue)", "工作": "var(--accent-orange)",
  "休息": "var(--accent-green)", "吃药": "var(--accent-red)",
};

function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (target === prev.current) return;
    prev.current = target;
    const start = performance.now();
    const from = current;
    const frame = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(from + (target - from) * eased));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [target, duration]);
  return current;
}

function typeLabel(t: string): string {
  const m: Record<string, string> = { "single": "单次", "repeating": "重复", "\"single\"": "单次", "\"repeating\"": "重复" };
  return m[t] || t;
}

export default function Stats() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const result = await invoke<TaskStats>("get_stats");
      setStats(result);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const animTotal = useAnimatedNumber(stats?.total ?? 0);
  const animRunning = useAnimatedNumber(stats?.running ?? 0);

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">📊 统计</div>
        <div className="empty-state"><p>加载中...</p></div>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="card">
        <div className="card-title">📊 统计</div>
        <div className="empty-state">
          <div className="emoji">📈</div>
          <p>暂无数据</p>
          <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
            创建定时任务后，这里会显示统计
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">📊 统计</div>

      {/* 概览卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <div className="stat-card" style={{ background: "var(--bg-input)", borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-blue)", fontVariantNumeric: "tabular-nums" }}>
            <span className="digit-pop" key={`t-${animTotal}`}>{animTotal}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>总任务</div>
        </div>
        <div className="stat-card" style={{ background: "var(--bg-input)", borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-orange)", fontVariantNumeric: "tabular-nums" }}>
            <span className="digit-pop" key={`r-${animRunning}`}>{animRunning}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>运行中</div>
        </div>
      </div>

      {/* 类型分布 */}
      {stats.by_type.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>任务类型</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {stats.by_type.map((t) => (
              <div key={t.task_type} style={{
                flex: 1, minWidth: 80, background: "var(--bg-input)", borderRadius: 10,
                padding: "10px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-blue)" }}>
                  {t.total}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {typeLabel(t.task_type)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 分类统计 */}
      {stats.by_category.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>分类分布</div>
          {stats.by_category.map((cat) => {
            const pct = stats.total > 0 ? Math.round((cat.total / stats.total) * 100) : 0;
            return (
              <div key={cat.category} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span><span style={{ color: CAT_COLORS[cat.category] || "var(--accent-purple)" }}>●</span> {cat.category}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{cat.total}</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: CAT_COLORS[cat.category] || "var(--accent-purple)",
                    borderRadius: 3, transition: "width 0.5s",
                  }} />
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
