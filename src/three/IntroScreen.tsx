import { css } from "@emotion/react";

interface IntroScreenProps {
  onEnter: () => void;
  isTransitioning: boolean;
}

export function IntroScreen({ onEnter, isTransitioning }: IntroScreenProps) {
  return (
    <div
      css={css({
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 20000,
        isolation: "isolate",
        overflow: "hidden",
        backgroundColor: "#000000",
        opacity: isTransitioning ? 0 : 1,
        transition: "opacity 1s ease-out",
        pointerEvents: isTransitioning ? "none" : "auto",
        background: "#000 url('/image-1791381674277.png') 0 0 / 100% 100% no-repeat",
      })}
    >
      <button
          onClick={onEnter}
          aria-label="Enter Terrain"
          css={css({
            position: "absolute",
            left: "38.54%",
            top: "52.44%",
            width: "23.24%",
            height: "7.52%",
            padding: 0,
            border: 0,
            background: "transparent",
            cursor: "pointer",
          })}
        >
        </button>
    </div>
  );
}
