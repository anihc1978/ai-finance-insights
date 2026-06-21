// src/components/ChatAssistant.tsx
// ---------------------------------------------------------------------------
// A self-contained AI money assistant chat panel. Keeps the whole conversation
// in local state, posts {message, history} to POST /chat, and renders the
// running transcript plus an input box. No required props — drop it anywhere.
//
// The backend (app.services.chat.build_chat_reply) answers ONLY from this
// user's data via Claude tool-use, so the panel itself stays presentational.
// ---------------------------------------------------------------------------
import { useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";

// One turn in the conversation. Mirrors the {role, content} shape the backend
// expects for `history` (roles are exactly "user" | "assistant").
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Request/response shapes for POST /chat (typed so apiPost stays type-safe).
interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

interface ChatResponse {
  reply: string;
}

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

const transcriptStyle: React.CSSProperties = {
  maxHeight: 360,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 12,
};

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    // History sent to the backend is the conversation BEFORE this new message
    // (the contract's POST /chat takes {message, history}).
    const history = messages;

    setMessages([...messages, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await apiPost<ChatRequest, ChatResponse>("/chat", {
        message: text,
        history,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Pregúntale a tu dinero</h3>

      <div style={transcriptStyle}>
        {messages.length === 0 && !loading ? (
          <p style={{ color: "#666", margin: 0 }}>
            Pregunta sobre tus gastos, por ejemplo: “¿Cuánto gasté en alimentos el
            mes pasado?”
          </p>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: isUser ? "#0ea5e9" : "#f3f4f6",
                  color: isUser ? "white" : "#111",
                  whiteSpace: "pre-line",
                  lineHeight: 1.5,
                }}
              >
                {m.content}
              </div>
            );
          })
        )}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              padding: "8px 12px",
              borderRadius: 12,
              background: "#f3f4f6",
              color: "#666",
              fontStyle: "italic",
            }}
          >
            Pensando…
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 0, marginBottom: 12 }}>
          ⚠️ {error}
        </p>
      )}

      <form style={{ display: "flex", gap: 8 }} onSubmit={send}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale a tu dinero…"
          disabled={loading}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: loading || input.trim().length === 0 ? "#9ca3af" : "#0ea5e9",
            color: "white",
            fontWeight: 600,
            cursor: loading || input.trim().length === 0 ? "default" : "pointer",
          }}
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
