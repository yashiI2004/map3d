import React, { useState, useEffect } from "react";
import { css } from "@emotion/react";

export function UploadImages({ onSelect }: { onSelect?: (files: File[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    onSelect?.(files);
    // revoke URLs on cleanup
    return () => {
      files.forEach((f: any) => {
        if (f && (f as any).__preview) URL.revokeObjectURL((f as any).__preview);
      });
    };
  }, [files, onSelect]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;
    const arr = Array.from(selected).slice(0, 60); // cap to 60 for safety
    // attach preview URL
    const withPreview = arr.map((f) => {
      (f as any).__preview = URL.createObjectURL(f);
      return f;
    });
    setFiles(withPreview);
  }

  function removeFile(index: number) {
    const f = files[index] as any;
    if (f && f.__preview) URL.revokeObjectURL(f.__preview);
    const copy = files.slice(0);
    copy.splice(index, 1);
    setFiles(copy);
  }

  return (
    <div
      css={css({
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      })}
    >
      <label
        css={css({
          display: "inline-flex",
          gap: "0.6rem",
          alignItems: "center",
          padding: "0.6rem 0.9rem",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.96)",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
        })}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          style={{ display: "none" }}
        />
        <span style={{ fontWeight: 700 }}>Select photos</span>
        <span style={{ color: "#6b7280" }}> (recommended: 10–80 overlapping photos)</span>
      </label>

      <div
        css={css({
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
          gap: "0.6rem",
        })}
      >
        {files.map((file, i) => (
          <div
            key={i}
            css={css({
              width: "84px",
              height: "84px",
              overflow: "hidden",
              borderRadius: "8px",
              position: "relative",
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <img
              src={(file as any).__preview}
              alt={file.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <button
              onClick={() => removeFile(i)}
              css={css({
                position: "absolute",
                top: 6,
                right: 6,
                background: "rgba(0,0,0,0.5)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "0.15rem 0.35rem",
                cursor: "pointer",
                fontSize: "11px",
              })}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div css={css({ color: "#6b7280", fontSize: "0.95rem" })}>
        {files.length === 0 ? "No photos selected" : `${files.length} photos selected`}
      </div>
    </div>
  );
}
