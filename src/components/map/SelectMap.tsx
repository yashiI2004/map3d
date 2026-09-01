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
import { CircleMinus, MousePointerClick } from "lucide-react";

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
        width: "min(24rem, calc(100% - 2rem))",
      })}
    >
      <form
        onSubmit={handleSearch}
        css={css({
          display: "flex",
          gap: "0.5rem",
          backgroundColor: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(8px)",
          borderRadius: "10px",
          padding: "0.55rem",
          boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
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
            fontSize: "13px",
            background: "transparent",
          })}
        />
        <button
          type="submit"
          css={css({
            border: "none",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            borderRadius: "8px",
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
            backgroundColor: "rgba(255,255,255,0.94)",
            borderRadius: "8px",
            padding: "0.55rem 0.7rem",
            fontSize: "12px",
            color: "#374151",
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
            backgroundColor: "rgba(255,255,255,0.96)",
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
                color: "#111827",
                fontSize: "12px",
                ":hover": {
                  backgroundColor: "#f3f4f6",
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
      })}
    >
      <div
        css={css({
          position: "absolute",
          zIndex: 9999,
          right: "1rem",
          top: "1rem",
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
            backgroundColor: "#ef4444",
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
            color: isDrag ? "#ffffff" : "#000000",
            backgroundColor: isDrag ? "#007bffe8" : "#ffffff96",
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
              backgroundColor: isDrag ? "#085fbd" : "#ebeef0c2",
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
          height: "70vh",
          width: "100%",
          minHeight: "420px",
        }}
      >
        <LocationSearch />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
