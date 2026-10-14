import { css } from "@emotion/react";
import React from "react";

export function FullscreenModal({
  children,
  isOpen = false,
}: {
  children: React.ReactNode;
  isOpen?: boolean;
}) {
  return (
    <div
      css={css({
        width: "100%",
        height: "100%",
        position: "fixed",
        zIndex: 999,
        backgroundColor: "#080a0c",
        color: "#f4f7fb",
        display: isOpen ? "flex" : "none",
      })}
    >
      <div
        css={css({
          padding: "4.25rem 2.5rem 2rem",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          overflowY: "auto",
        })}
      >
        {children}
      </div>
    </div>
  );
}
