import { useCarStore } from "@/state/carStore";
import { MarkerType, useAreaStore } from "@/state/areaStore";
import { css } from "@emotion/react";
import { DetailedHTMLProps, ButtonHTMLAttributes, useState } from "react";
import { Modal } from "../modal/Modal";
import { Column } from "../flex/Column";
import { Title } from "../text/Title";
import { Description } from "../text/Description";

const TOP_PANEL_HEIGHT = "3rem";
const BORDER_COLOR = "#ededf290";

const breakpoints = [768];
const mq = breakpoints.map((bp) => `@media (max-width: ${bp}px)`);

interface ButtonProps
  extends DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  isShow?: boolean;
}

export function TopNav({ step }: { step: number }) {
  const setThirdMode = useCarStore((state) => state.setThirdMode);
  const thirdMode = useCarStore((state) => state.thirdMode);
  const controls = useCarStore((state) => state.controls);
  const setControl = useCarStore((state) => state.setControl);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  const markers = useAreaStore((state) => state.markers);
  const selectedMarkerType = useAreaStore((state) => state.selectedMarkerType);
  const noteText = useAreaStore((state) => state.noteText);
  const planMode = useAreaStore((state) => state.planMode);
  const advanceMode = useAreaStore((state) => state.advanceMode);
  const advanceColor = useAreaStore((state) => state.advanceColor);
  const setSelectedMarkerType = useAreaStore((state) => state.setSelectedMarkerType);
  const setNoteText = useAreaStore((state) => state.setNoteText);
  const setPlanMode = useAreaStore((state) => state.setPlanMode);
  const setAdvanceMode = useAreaStore((state) => state.setAdvanceMode);
  const setAdvanceColor = useAreaStore((state) => state.setAdvanceColor);
  const removeMarker = useAreaStore((state) => state.removeMarker);
  const clearMarkers = useAreaStore((state) => state.clearMarkers);

  const [openModal, setOpenModal] = useState(false);

  const markerOptions: Array<{ value: MarkerType; label: string }> = [
    { value: "enemy", label: "Enemy" },
    { value: "hospital", label: "Hospital" },
    { value: "rescue", label: "Rescue" },
    { value: "note", label: "Note" },
    { value: "soldier", label: "Soldier" },
  ];

  return (
    <>
      <div
        css={css({
          display: "flex",
          transition: ".5s",
          transform: "translate(0px, 0px)",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: TOP_PANEL_HEIGHT,
          backgroundColor: "#111416e8",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid #2b3034",
          zIndex: 9999,
          justifyContent: "space-between",
          alignItems: "center",
        })}
      >
        <div
          css={css({
            paddingLeft: "1.25rem",
            alignItems: "center",
            flexDirection: "row",
            display: "flex",
            gap: "0.75rem",
          })}
        >
          <span
            css={css({
              fontSize: "14px",
              fontWeight: "600",
              color: "#f1f5f9",
              letterSpacing: "0.02em",
            })}
          >
            🗺️ Terrain
          </span>
        </div>

        <div
          css={css({
            padding: "0rem 0rem",
            [mq[0]]: {
              display: "none",
            },
          })}
        ></div>

        <div
          css={css({
            paddingRight: "1.25rem",
            display: "flex",
            flexDirection: "row",
            gap: "0.45rem",
          })}
        >
          <NavButton isShow={step >= 1} onClick={() => setOpenModal(true)}>
            Options
          </NavButton>
          {!isMobile && step == 2 && (
            <>
              <NavButton
                isShow={true}
                onClick={() => setPlanMode(!planMode)}
              >
                {planMode ? "Planning" : "Plan"}
              </NavButton>
              <NavButton
                isShow={true}
                onClick={() => setAdvanceMode(!advanceMode)}
              >
                {advanceMode ? "Advance On" : "Advance"}
              </NavButton>
            </>
          )}

          {!isMobile && (
            <>
              {thirdMode ? (
                <NavButton
                  isShow={step == 2}
                  onClick={() => setThirdMode(false)}
                >
                  Disable Car
                </NavButton>
              ) : (
                <NavButton
                  isShow={step == 2}
                  onClick={() => setThirdMode(true)}
                >
                  Car Mode
                </NavButton>
              )}
            </>
          )}
        </div>
      </div>
      {thirdMode && step == 2 && (
        <div
          css={css({
            position: "fixed",
            right: "1rem",
            bottom: "1rem",
            zIndex: 9999,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.45rem",
            width: "12rem",
            padding: "0.75rem",
            backgroundColor: "rgba(255,255,255,0.88)",
            borderRadius: "18px",
            boxShadow: "0 16px 30px rgba(0,0,0,0.12)",
            border: "1px solid rgba(148,163,184,0.24)",
          })}
        >
          <button
            css={css({
              gridColumn: "2 / 3",
              padding: "0.75rem",
              borderRadius: "12px",
              border: controls.forward ? "2px solid #2563eb" : "1px solid #d1d5db",
              backgroundColor: controls.forward ? "#bfdbfe" : "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            })}
            onMouseDown={() => setControl("forward", true)}
            onMouseUp={() => setControl("forward", false)}
            onMouseLeave={() => setControl("forward", false)}
          >
            ▲
          </button>
          <button
            css={css({
              gridColumn: "1 / 2",
              padding: "0.75rem",
              borderRadius: "12px",
              border: controls.left ? "2px solid #2563eb" : "1px solid #d1d5db",
              backgroundColor: controls.left ? "#bfdbfe" : "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            })}
            onMouseDown={() => setControl("left", true)}
            onMouseUp={() => setControl("left", false)}
            onMouseLeave={() => setControl("left", false)}
          >
            ◀
          </button>
          <button
            css={css({
              gridColumn: "3 / 4",
              padding: "0.75rem",
              borderRadius: "12px",
              border: controls.right ? "2px solid #2563eb" : "1px solid #d1d5db",
              backgroundColor: controls.right ? "#bfdbfe" : "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            })}
            onMouseDown={() => setControl("right", true)}
            onMouseUp={() => setControl("right", false)}
            onMouseLeave={() => setControl("right", false)}
          >
            ▶
          </button>
          <button
            css={css({
              gridColumn: "2 / 3",
              padding: "0.75rem",
              borderRadius: "12px",
              border: controls.backward ? "2px solid #2563eb" : "1px solid #d1d5db",
              backgroundColor: controls.backward ? "#bfdbfe" : "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            })}
            onMouseDown={() => setControl("backward", true)}
            onMouseUp={() => setControl("backward", false)}
            onMouseLeave={() => setControl("backward", false)}
          >
            ▼
          </button>
        </div>
      )}

      <Modal isOpen={openModal} onClose={() => setOpenModal(false)}>
        <Column gap="0.7rem">
          <Title>Options</Title>
          <Description>
            Select a marker type and click anywhere on the terrain to place it.
            Click a marker to remove it and keep checkpoints visible in red.
          </Description>

          <div
            css={css({
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.5rem",
            })}
          >
            {markerOptions.map((marker) => (
              <button
                key={marker.value}
                css={css({
                  border: selectedMarkerType === marker.value ? "1px solid #1d4ed8" : "1px solid #d9d9d9",
                  borderRadius: "8px",
                  padding: "0.55rem 0.7rem",
                  backgroundColor: selectedMarkerType === marker.value ? "#dbeafe" : "#fff",
                  color: "#1f2937",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                })}
                onClick={() => setSelectedMarkerType(marker.value)}
              >
                {marker.label}
              </button>
            ))}
          </div>

          <textarea
            css={css({
              minHeight: "4.4rem",
              border: "1px solid #d9d9d9",
              borderRadius: "8px",
              padding: "0.6rem",
              fontSize: "12px",
              resize: "vertical",
            })}
            placeholder={
              selectedMarkerType === "note"
                ? "Write a note for this marker"
                : selectedMarkerType === "soldier"
                ? "Enter a name or sport for the soldier"
                : "Optional note for the selected marker"
            }
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
          />

          <button
            css={css({
              border: "1px solid #d9d9d9",
              borderRadius: "8px",
              padding: "0.55rem 0.7rem",
              backgroundColor: "#f9fafb",
              color: "#374151",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            })}
            onClick={() => clearMarkers()}
          >
            Clear all markers
          </button>

          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              marginTop: "1rem",
            })}
          >
            <Description>Advance shape color</Description>
            <input
              type="color"
              value={advanceColor}
              onChange={(event) => setAdvanceColor(event.target.value)}
              css={css({
                width: "100%",
                height: "2.4rem",
                border: "none",
                borderRadius: "10px",
                padding: "0.25rem",
                cursor: "pointer",
              })}
            />
          </div>

          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              gap: "0.45rem",
            })}
          >
            <Description>Placed markers</Description>
            {markers.length === 0 ? (
              <span css={css({ color: "#6b7280", fontSize: "12px" })}>
                No markers placed yet.
              </span>
            ) : (
              markers.map((marker) => (
                <div
                  key={marker.id}
                  css={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "1px solid #ececec",
                    borderRadius: "8px",
                    padding: "0.5rem 0.65rem",
                  })}
                >
                  <span css={css({ fontSize: "12px", color: "#374151" })}>
                    {marker.type} {marker.note ? `• ${marker.note}` : ""}
                  </span>
                  <button
                    css={css({
                      border: "none",
                      background: "transparent",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontSize: "12px",
                    })}
                    onClick={() => removeMarker(marker.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </Column>
      </Modal>
    </>
  );
}

export function NavButton(props: ButtonProps) {
  return (
    <button
      css={css({
        color: "#000000",
        backgroundColor: "#ffffff96",
        backdropFilter: "blur(8px)",
        border: "none",
        padding: "0.5rem 1rem",
        borderRadius: "8px",
        fontWeight: "300",
        fontSize: "12px",
        outline: "rgba(240, 240, 244, 0.51) solid 0.1rem",
        display: props.isShow ? "" : "none",
        cursor: "pointer",
      })}
      {...props}
    >
      {props.children}
    </button>
  );
}
