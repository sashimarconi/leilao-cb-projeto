import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  value: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function QrCode({ value, size = 220, style }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "block", margin: "0 auto", borderRadius: 8, border: "1px solid #e0e0e0", ...style }}
    />
  );
}
