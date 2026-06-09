import { useEffect, useState, useCallback, createContext, useContext } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

type ToastFn = (msg: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastType, string> = {
  success: "✅", error: "❌", info: "ℹ️",
};
const COLORS: Record<ToastType, string> = {
  success: "var(--accent-green)",
  error: "var(--accent-red)",
  info: "var(--accent-blue)",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
    // 2 秒后开始退出
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      // 再等 300ms 动画完成移除
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 2000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 12,
            background: COLORS[t.type], color: "#fff",
            fontSize: 14, fontWeight: 500, whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            animation: t.exiting ? "toastOut 0.3s ease-in forwards" : "toastIn 0.3s ease-out",
          }}>
            <span>{ICONS[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
