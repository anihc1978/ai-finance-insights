// src/components/ProfileAvatar.tsx
// ---------------------------------------------------------------------------
// A circular avatar button for the header. Shows an uploaded photo
// (localStorage "fin_avatar", a data URL) if set, otherwise the first letter of
// the name on a colored circle (color from localStorage "fin_avatar_color").
// Clicking opens a small panel to edit the name (localStorage "fin_nombre"),
// pick a preset color, or upload/remove a photo. Uploaded photos are downscaled
// to a 96px square via canvas before being stored. Self-contained.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { tokens } from "../lib/theme";

const PRESET_COLORS = ["#1D9E75", "#378ADD", "#D85A30", "#7F77DD", "#D4537E"];
const DEFAULT_COLOR = tokens.colors.accent;
const AVATAR_PX = 40;

function readName(): string {
  return localStorage.getItem("fin_nombre") ?? "";
}
function readPhoto(): string | null {
  return localStorage.getItem("fin_avatar");
}
function readColor(): string {
  return localStorage.getItem("fin_avatar_color") ?? DEFAULT_COLOR;
}

/** Downscale an image File to a centered 96px square data URL via canvas. */
function downscalePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const size = 96;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no-canvas-context"));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileAvatar() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>(readName);
  const [photo, setPhoto] = useState<string | null>(readPhoto);
  const [color, setColor] = useState<string>(readColor);

  // Draft state for the editing panel.
  const [draftName, setDraftName] = useState(name);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(photo);
  const [draftColor, setDraftColor] = useState(color);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // When opening the panel, seed the drafts from the saved values.
  useEffect(() => {
    if (open) {
      setDraftName(name);
      setDraftPhoto(photo);
      setDraftColor(color);
    }
  }, [open, name, photo, color]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await downscalePhoto(file);
      setDraftPhoto(dataUrl);
    } catch {
      // Ignore unreadable images; the user can try another.
    }
  }

  function save() {
    const clean = draftName.trim();
    setName(clean);
    setPhoto(draftPhoto);
    setColor(draftColor);
    localStorage.setItem("fin_nombre", clean);
    localStorage.setItem("fin_avatar_color", draftColor);
    if (draftPhoto) localStorage.setItem("fin_avatar", draftPhoto);
    else localStorage.removeItem("fin_avatar");
    setOpen(false);
  }

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const previewInitial = (draftName.trim().charAt(0) || "?").toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Perfil"
        style={{
          width: AVATAR_PX,
          height: AVATAR_PX,
          borderRadius: "50%",
          border: `1px solid ${tokens.colors.border}`,
          padding: 0,
          cursor: "pointer",
          overflow: "hidden",
          background: photo ? "transparent" : color,
          color: "#ffffff",
          fontSize: 16,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: AVATAR_PX + 8,
            right: 0,
            zIndex: 50,
            width: 260,
            background: tokens.colors.cardBg,
            border: `1px solid ${tokens.colors.border}`,
            borderRadius: tokens.radii.card,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: tokens.spacing.md,
            display: "flex",
            flexDirection: "column",
            gap: tokens.spacing.md,
          }}
        >
          {/* Preview + name field */}
          <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.md }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                overflow: "hidden",
                background: draftPhoto ? "transparent" : draftColor,
                color: "#ffffff",
                fontSize: 20,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {draftPhoto ? (
                <img
                  src={draftPhoto}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                previewInitial
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: tokens.colors.textMuted,
                  marginBottom: 4,
                }}
              >
                Tu nombre
              </label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Tu nombre"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontSize: 14,
                  padding: "6px 8px",
                  borderRadius: tokens.radii.input,
                  border: `1px solid ${tokens.colors.border}`,
                }}
              />
            </div>
          </div>

          {/* Color swatches */}
          <div>
            <span style={{ fontSize: 12, color: tokens.colors.textMuted }}>Color</span>
            <div style={{ display: "flex", gap: tokens.spacing.sm, marginTop: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftColor(c)}
                  aria-label={`Color ${c}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border:
                      draftColor === c
                        ? `2px solid ${tokens.colors.text}`
                        : `2px solid transparent`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Photo upload / remove */}
          <div style={{ display: "flex", gap: tokens.spacing.sm }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                flex: 1,
                fontSize: 13,
                padding: "6px 10px",
                borderRadius: tokens.radii.pill,
                border: `1px solid ${tokens.colors.border}`,
                background: tokens.colors.surface,
                cursor: "pointer",
              }}
            >
              Subir foto
            </button>
            {draftPhoto && (
              <button
                type="button"
                onClick={() => setDraftPhoto(null)}
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: tokens.radii.pill,
                  border: `1px solid ${tokens.colors.border}`,
                  background: tokens.colors.cardBg,
                  cursor: "pointer",
                }}
              >
                Quitar foto
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: tokens.spacing.sm, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: tokens.radii.pill,
                border: `1px solid ${tokens.colors.border}`,
                background: tokens.colors.cardBg,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 14px",
                borderRadius: tokens.radii.pill,
                border: `1px solid ${tokens.colors.accent}`,
                background: tokens.colors.accent,
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
