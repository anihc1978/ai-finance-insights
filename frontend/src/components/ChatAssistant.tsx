// src/components/ChatAssistant.tsx
// ---------------------------------------------------------------------------
// A self-contained AI money assistant chat panel. Keeps the whole conversation
// in local state, posts {message, history} to POST /chat, and renders the
// running transcript plus a premium Claude-style prompt box. No required
// props — drop it anywhere.
//
// The backend (app.services.chat.build_chat_reply) answers ONLY from this
// user's data via Claude tool-use, so the panel itself stays presentational.
//
// All colours come from `tokens` (which read from CSS vars), so the whole
// component themes itself in light AND dark with no per-style edits.
// ---------------------------------------------------------------------------
import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { apiPost } from "../lib/api";
import { tokens } from "../lib/theme";
import { useLang } from "../lib/i18n";

const T = {
  es: {
    heading: "💬 Pregúntale a la IA",
    subtitle:
      "Tu experta en finanzas. Pregúntale lo que quieras sobre tus gastos, ingresos y ahorro.",
    placeholder: "Escribe tu pregunta sobre tus finanzas…",
    thinking: "Pensando…",
    send: "Enviar",
    error: "Algo salió mal.",
    aiBadge: "✨ IA",
    suggestions: [
      "¿En qué gasté más este mes?",
      "¿Cuánto puedo ahorrar?",
      "¿Tengo suscripciones que cancelar?",
      "¿Me alcanza para un viaje?",
    ],
  },
  en: {
    heading: "💬 Ask the AI",
    subtitle:
      "Your finance expert. Ask anything about your spending, income and savings.",
    placeholder: "Type your question about your finances…",
    thinking: "Thinking…",
    send: "Send",
    error: "Something went wrong.",
    aiBadge: "✨ AI",
    suggestions: [
      "What did I spend most on this month?",
      "How much can I save?",
      "Any subscriptions to cancel?",
      "Can I afford a trip?",
    ],
  },
} as const;

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

const { colors, radii, spacing } = tokens;

const wrapperStyle: CSSProperties = {
  marginTop: spacing.lg,
  display: "flex",
  flexDirection: "column",
  gap: spacing.md,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(26px, 7vw, 36px)",
  fontWeight: 800,
  lineHeight: 1.05,
  color: colors.accent,
  textTransform: "uppercase",
  letterSpacing: "0.01em",
  textAlign: "center",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.45,
  color: colors.textMuted,
  textAlign: "center",
};

const transcriptStyle: CSSProperties = {
  maxHeight: 360,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: spacing.sm,
};

export function ChatAssistant() {
  const t = T[useLang()];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-grow the textarea: reset height then size to content, capped at ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 150; // ~6 lines before it scrolls
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [input]);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const canSend = input.trim().length > 0 && !loading;

  // Core send logic — unchanged contract: posts {message, history} to /chat,
  // appends the reply. `history` is the conversation BEFORE the new message.
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const history = messages;

    setMessages([...messages, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await apiPost<ChatRequest, ChatResponse>("/chat", {
        message: trimmed,
        history,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void send(input);
    }
  }

  const showSuggestions = messages.length === 0 && !loading;

  return (
    <section style={wrapperStyle}>
      {/* Heading */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: spacing.xs }}>
        <h2 style={headingStyle}>
          {t.heading}
        </h2>
        <p style={subtitleStyle}>
          {t.subtitle}
        </p>
      </div>

      {/* Transcript (only once there's a conversation) */}
      {(messages.length > 0 || loading) && (
        <div ref={transcriptRef} style={transcriptStyle}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: 16,
                  background: isUser ? colors.accent : colors.surface,
                  color: isUser ? "#FFFFFF" : colors.text,
                  border: isUser ? "none" : `1px solid ${colors.border}`,
                  whiteSpace: "pre-line",
                  lineHeight: 1.55,
                  fontSize: 14,
                }}
              >
                {m.content}
              </div>
            );
          })}

          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: "10px 14px",
                borderRadius: 16,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 14,
              }}
            >
              <Spinner color={colors.textMuted} />
              {t.thinking}
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: colors.down, margin: 0, fontSize: 13 }}>
          ⚠️ {error}
        </p>
      )}

      {/* Prompt box */}
      <div
        onClick={() => textareaRef.current?.focus()}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: 20,
          background: colors.cardBg,
          border: `1px solid ${focused ? colors.accent : colors.border}`,
          boxShadow: focused
            ? `0 0 0 4px ${withAlpha(colors.accent, 0.14)}, 0 2px 8px rgba(0,0,0,0.04)`
            : "0 1px 3px rgba(0,0,0,0.04)",
          transition: "border-color .15s, box-shadow .15s",
          cursor: "text",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t.placeholder}
          rows={1}
          disabled={loading}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: colors.text,
            fontSize: 15,
            lineHeight: 1.5,
            fontFamily: "inherit",
            padding: 0,
            maxHeight: 150,
            overflowY: "auto",
          }}
        />

        {/* Action row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: spacing.xs,
              padding: "4px 10px",
              borderRadius: radii.pill,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            {t.aiBadge}
          </span>

          <button
            type="button"
            onClick={() => void send(input)}
            disabled={!canSend}
            aria-label={t.send}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: canSend ? colors.accent : colors.flat,
              color: "#FFFFFF",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: canSend ? "pointer" : "default",
              opacity: canSend ? 1 : 0.55,
              transition: "background .15s, opacity .15s",
              flexShrink: 0,
            }}
          >
            {loading ? <Spinner color="#FFFFFF" /> : <SendIcon />}
          </button>
        </div>
      </div>

      {/* Suggestion chips (only before any conversation) */}
      {showSuggestions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.sm }}>
          {t.suggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              style={{
                padding: "8px 14px",
                borderRadius: radii.pill,
                border: `1px solid ${colors.border}`,
                background: colors.surface,
                color: colors.text,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1.3,
                fontFamily: "inherit",
                transition: "border-color .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border;
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// --- Tiny inline visuals ---------------------------------------------------

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: "fin-spin 0.7s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="2.5"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <style>{`@keyframes fin-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// Build an rgba()/color-mix string for the focus ring. The accent is a CSS var
// ("var(--c-accent)"), so a literal hex parse won't work — use color-mix, which
// every modern browser (and the project's build target) supports.
function withAlpha(cssColor: string, alpha: number): string {
  return `color-mix(in srgb, ${cssColor} ${Math.round(alpha * 100)}%, transparent)`;
}
