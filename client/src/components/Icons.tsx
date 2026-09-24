// Small inline SVG icons, so the app needs no icon library.

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CalendarIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

export function TodayIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <rect x="8" y="13" width="4" height="4" fill="currentColor" />
    </Svg>
  );
}

export function CaretDownIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 9h12l-6 7z" />
    </svg>
  );
}

export function PlusIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function RepeatIcon({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </Svg>
  );
}

export function HomeIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3 11l9-8 9 8v10H3z" />
    </Svg>
  );
}

export function PersonIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </Svg>
  );
}

export function MapPinIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function SyncIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </Svg>
  );
}
