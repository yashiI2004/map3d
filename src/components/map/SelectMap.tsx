import React, { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { css } from "@emotion/react";
import {
  CircleMinus,
  Layers3,
  MapPin,
  MousePointerClick,
  Route,
  Ruler,
  Satellite,
  Sun,
} from "lucide-react";

const IconSize = css({
  width: "14px",
  height: "14px",
});

function LocationSearch() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setMessage("Enter a location to search.");
      return;
    }

    setIsSearching(true);
    setMessage("");

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmedQuery)}`,
        {
          headers: {
            "Accept-Language": "en",
          },
        }
      );
      const data = await response.json();

      if (data?.length) {
        setResults(data);
        const firstResult = data[0];
        const lat = parseFloat(firstResult.lat);
        const lng = parseFloat(firstResult.lon);
        setSelectedResult(firstResult);
        map.flyTo([lat, lng], Math.max(13, Math.min(18, map.getZoom() || 13)), {
          duration: 1.2,
        });
        setMessage(`Showing ${firstResult.display_name}`);
      } else {
        setResults([]);
        setMessage("No matching location found.");
      }
    } catch (error) {
      setResults([]);
      setMessage("Unable to search right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const focusResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setSelectedResult(result);
    map.flyTo([lat, lng], 14, { duration: 1.2 });
    setQuery(result.display_name);
    setResults([]);
    setMessage(`Focused on ${result.display_name}`);
  };

  return (
    <div
      css={css({
        position: "absolute",
        top: "1rem",
        left: "1rem",
        zIndex: 9999,
        width: "min(25rem, calc(100% - 2rem))",
      })}
    >
      <form
        onSubmit={handleSearch}
        css={css({
          display: "flex",
          gap: "0.5rem",
          backgroundColor: "rgba(18,22,25,0.92)",
          backdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "8px",
          padding: "0.45rem",
          boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        })}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search location"
          css={css({
            flex: 1,
            border: "none",
            outline: "none",
            color: "#f8fafc",
            fontSize: "13px",
            background: "transparent",
          })}
        />
        <button
          type="submit"
          css={css({
            border: "none",
            backgroundColor: "#e7edf2",
            color: "#11161a",
            borderRadius: "6px",
            padding: "0.45rem 0.8rem",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
          })}
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </form>
      {message && (
        <div
          css={css({
            marginTop: "0.45rem",
            backgroundColor: "rgba(18,22,25,0.94)",
            borderRadius: "8px",
            padding: "0.55rem 0.7rem",
            fontSize: "12px",
            color: "#dbe4ec",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          })}
        >
          {message}
        </div>
      )}
      {results.length > 0 && (
        <div
          css={css({
            marginTop: "0.45rem",
            backgroundColor: "rgba(18,22,25,0.97)",
            borderRadius: "10px",
            padding: "0.4rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: "0.3rem",
          })}
        >
          {results.map((result) => (
            <button
              key={result.place_id}
              type="button"
              onClick={() => focusResult(result)}
              css={css({
                textAlign: "left",
                border: "none",
                background: "transparent",
                padding: "0.45rem 0.55rem",
                borderRadius: "8px",
                cursor: "pointer",
                color: "#f1f5f9",
                fontSize: "12px",
                ":hover": {
                  backgroundColor: "#2b3339",
                },
              })}
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}
      {selectedResult && (
        <CircleMarker
          center={[parseFloat(selectedResult.lat), parseFloat(selectedResult.lon)]}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#2563eb",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>{selectedResult.display_name}</Popup>
        </CircleMarker>
      )}
    </div>
  );
}

function RectangleSelector({
  isDrag = true,

  bounds,
  drawBounds,

  onChange,
  onDrawChange,
}: {
  isDrag: boolean;

  bounds: LatLngBounds | null;
  drawBounds: LatLngBounds | null;

  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (bounds: LatLngBounds) => void;
}) {
  const [firstPoint, setFirstPoint] = useState<LatLng | null>(null);

  const lastLatlngRef = useRef<LatLng | null>(null);

  const adjustLng = (latlng: LatLng): LatLng => {
    const adjustedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return new L.LatLng(latlng.lat, adjustedLng);
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        setFirstPoint(e.latlng);
      }
    },
    mousemove(e) {
      if (firstPoint) {
        lastLatlngRef.current = adjustLng(e.latlng);
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng))
        );
      }
    },
    mouseup(e) {
      if (firstPoint) {
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng))
        );
        setFirstPoint(null);
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrag && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);
        setFirstPoint(latlng);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (firstPoint && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);
        lastLatlngRef.current = latlng;

        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (firstPoint) {
        const latlng = lastLatlngRef.current || firstPoint;

        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
        setFirstPoint(null);
      }
    };

    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchmove", handleTouchMove);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [map, isDrag, firstPoint, onChange]);

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle bounds={drawBounds} pathOptions={{ color: "blue" }} />
  ) : null;
}

export function MapComponent({
  onDone,
  onRemove,
}: {
  onDone: (e) => void;
  onRemove: () => void;
}) {
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [drawBounds, setDrawBounds] = useState<LatLngBounds | null>(null);

  const handleClickSwitchDrag = () => {
    setIsDrag(!isDrag);
  };

  const handleClickRemoveBox = () => {
    onRemove();
    setBounds(null);
    setDrawBounds(null);
    setIsDrag(true);
  };

  const handleChangeDone = (e) => {
    setBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  const handleChangeDraw = (e) => {
    setDrawBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  return (
    <div
      css={css({
        position: "relative",
        height: "calc(100vh - 7rem)",
        minHeight: "480px",
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "#050607",
        border: "1px solid #242a2f",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      })}
    >
      <div
        aria-label="Map tools"
        css={css({
          position: "absolute",
          zIndex: 10000,
          top: 0,
          left: 0,
          right: 0,
          height: "3rem",
          display: "flex",
          alignItems: "center",
          gap: "0.2rem",
          padding: "0 0.75rem",
          backgroundColor: "#15191ce8",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
        })}
      >
        <span
          css={css({
            color: "#f8fafc",
            fontSize: "12px",
            fontWeight: 700,
            marginRight: "0.6rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          })}
        >
          Map workspace
        </span>
        {[
          { label: "Lighting", icon: Sun },
          { label: "Location", icon: MapPin },
          { label: "Routes", icon: Route },
          { label: "Layers", icon: Layers3 },
          { label: "Measure", icon: Ruler },
          { label: "Satellite", icon: Satellite },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            css={css({
              width: "2.25rem",
              height: "2.25rem",
              display: "grid",
              placeItems: "center",
              border: "none",
              borderRadius: "6px",
              color: "#aeb8c1",
              background: "transparent",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              ":hover": { color: "#ffffff", background: "#2d353b" },
            })}
          >
            <Icon size={16} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      <div
        css={css({
          position: "absolute",
          zIndex: 9999,
          right: "1rem",
          top: "4rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: "0.5rem",
        })}
      >
        <button
          css={css({
            display: bounds == null || isDrag == true ? "none" : "flex",
            color: "#ffffff",
            backgroundColor: "#b93838",
            backdropFilter: "blur(8px)",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            outline: "#ef4444c2 solid 0.1rem",
            cursor: "pointer",
            transition: "0.2s",
            alignItems: "center",
            gap: "0.5rem",
            ":hover": {
              backgroundColor: "#ef4444",
            },
          })}
          onClick={handleClickRemoveBox}
        >
          <CircleMinus css={IconSize} /> Remove Box
        </button>

        <button
          css={css({
            color: isDrag ? "#11161a" : "#e7edf2",
            backgroundColor: isDrag ? "#e7edf2" : "#182025e8",
            backdropFilter: "blur(8px)",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            outline: isDrag
              ? "#086ad4c2 solid 0.1rem"
              : "rgba(240, 240, 244, 0.51) solid 0.1rem",
            cursor: "pointer",
            transition: "0.2s",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            ":hover": {
              backgroundColor: isDrag ? "#ffffff" : "#2d353b",
            },
          })}
          onClick={handleClickSwitchDrag}
        >
          {isDrag ? <SelectBox /> : "Back to Drag"}
        </button>
      </div>

      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={20}
        worldCopyJump
        zoomControl
        style={{
          height: "100%",
          width: "100%",
          minHeight: "480px",
        }}
      >
        <LocationSearch />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          className="terrain-map-tiles"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={20}
        />
        <RectangleSelector
          bounds={bounds}
          drawBounds={drawBounds}
          isDrag={isDrag}
          onChange={handleChangeDone}
          onDrawChange={handleChangeDraw}
        />
      </MapContainer>
    </div>
  );
}

function SelectBox() {
  return (
    <>
      <MousePointerClick css={IconSize} />
      <span>Select Box</span>
    </>
  );
}
