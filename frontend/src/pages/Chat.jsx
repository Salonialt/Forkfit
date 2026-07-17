import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { Send, Bot, User as UserIcon, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Suggest a high-protein vegetarian breakfast.",
  "Is mango good for weight loss?",
  "What should I eat after a workout?",
  "Plan a diabetic-friendly dinner.",
];

export default function Chat() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef();

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/chat/history");
      setMsgs(data.messages || []);
    })();
  }, []);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text) => {
    const t = text ?? input;
    if (!t.trim()) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: t, id: Date.now() }]);
    setBusy(true);
    try {
      const { data } = await api.post("/chat", { message: t });
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, id: Date.now() + 1 }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: "Sorry, I had trouble responding. Please try again.", id: Date.now() + 1 }]);
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="mb-6 fade-up">
        <span className="eyebrow">Powered by Claude Sonnet 4.5</span>
        <h1 className="font-display font-bold text-4xl sm:text-5xl mt-1" style={{ color: "var(--text)" }}>AI Nutrition Coach</h1>
      </div>

      <div className="clay-card flex flex-col h-[72vh]" data-testid="chat-window">
        <div ref={scroller} className="flex-1 overflow-y-auto p-6 space-y-4">
          {msgs.length === 0 && !busy && (
            <div className="text-center py-8">
              <Bot size={36} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
              <p className="font-display font-semibold" style={{ color: "var(--text)" }}>Ask me anything about your nutrition.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5 max-w-lg mx-auto">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} data-testid={`suggest-${i}`} onClick={() => send(s)}
                    className="p-3 text-sm text-left rounded-xl border hover:bg-[#F4F2EE] transition"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id || m.content} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`} data-testid={`msg-${m.role}`}>
              {m.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--primary)" }}>
                  <Bot size={16} color="white" />
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-[#4A6B53] text-white" : ""}`}
                style={m.role === "assistant" ? { background: "#F4F2EE", color: "var(--text)" } : {}}>
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EFEDE9" }}>
                  <UserIcon size={16} style={{ color: "var(--text)" }} />
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}><Bot size={16} color="white" /></div>
              <div className="px-4 py-3 rounded-2xl text-sm flex gap-1" style={{ background: "#F4F2EE" }}>
                <span className="w-2 h-2 rounded-full bg-[#4A6B53] animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-[#4A6B53] animate-bounce" style={{ animationDelay: ".15s" }} />
                <span className="w-2 h-2 rounded-full bg-[#4A6B53] animate-bounce" style={{ animationDelay: ".3s" }} />
              </div>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t p-4 flex gap-2" style={{ borderColor: "var(--border)" }}>
          <input data-testid="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Can I eat pizza today?" className="input-clay" />
          <button type="submit" disabled={busy || !input.trim()} data-testid="chat-send" className="pill-btn pill-btn-primary flex items-center gap-2 disabled:opacity-50">
            <Send size={14} />
          </button>
        </form>
      </div>
    </Layout>
  );
}