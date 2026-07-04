import { useRef, useState, useEffect } from "react";

export default function VideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [overlay, setOverlay] = useState<"none" | "mute" | "play">("play");
  const [showControls, setShowControls] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play()
      .then(() => {
        playingRef.current = true;
        setPlaying(true);
        setOverlay("mute");
      })
      .catch(() => {
        setOverlay("play");
      });
  }, []);

  function startPlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (playingRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    // Always start muted (guaranteed with user gesture), then unmute
    v.muted = true;
    v.play()
      .then(() => {
        playingRef.current = true;
        setPlaying(true);
        setMuted(false);
        v.muted = false;
        setOverlay("none");
      })
      .catch(() => {});
  }

  function handleUnmute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    setOverlay("none");
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => {
        playingRef.current = true;
        setPlaying(true);
      }).catch(() => {});
    } else {
      v.pause();
      playingRef.current = false;
      setPlaying(false);
    }
  }

  function handleMouseMove() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  }

  const controlsVisible = showControls || !playing;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: "#000",
        borderRadius: 8,
        overflow: "hidden",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="auto"
        muted={muted}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
        onPlay={() => { setPlaying(true); playingRef.current = true; }}
        onPause={() => { setPlaying(false); playingRef.current = false; }}
      />

      {/* Overlay "Clique para ouvir" — autoplay mudo funcionou */}
      {overlay === "mute" && (
        <div
          onClick={handleUnmute}
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <div style={{
            background: "rgba(160,50,130,0.88)",
            borderRadius: 10,
            padding: "12px 24px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Seu vídeo já começou</span>
            <svg width="38" height="38" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="28" fill="rgba(255,255,255,0.18)" />
              <path d="M18 22h5l7-6v24l-7-6h-5V22z" fill="white" />
              <line x1="34" y1="20" x2="44" y2="36" stroke="white" strokeWidth="3" strokeLinecap="round" />
              <line x1="44" y1="20" x2="34" y2="36" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Clique para ouvir</span>
          </div>
        </div>
      )}

      {/* Overlay de play — autoplay bloqueado */}
      {overlay === "play" && (
        <div
          onClick={startPlay}
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
            cursor: "pointer",
          }}
        >
          <div style={{
            background: "rgba(160,50,130,0.92)",
            borderRadius: "50%",
            width: 68, height: 68,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          </div>
        </div>
      )}

      {/* Barra inferior — só play/pause */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 46,
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          display: "flex", alignItems: "center", paddingLeft: 10,
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.3s",
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 10px", display: "flex", alignItems: "center",
          }}
        >
          {playing ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <rect x="5" y="3" width="4" height="18" rx="1" />
              <rect x="15" y="3" width="4" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21" fill="white" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
