import type { ReactNode } from "react";
import { CalendarIcon, HomeIcon, MapPinIcon, PersonIcon, SyncIcon } from "./Icons";

interface Tab {
  label: string;
  icon: ReactNode;
  /** Only the Calendar tab works in the MVP. The others are shown greyed out. */
  enabled: boolean;
}

const TABS: Tab[] = [
  { label: "Home", icon: <HomeIcon />, enabled: false },
  { label: "Calendar", icon: <CalendarIcon />, enabled: true },
  { label: "People", icon: <PersonIcon />, enabled: false },
  { label: "Map", icon: <MapPinIcon />, enabled: false },
  { label: "Sync", icon: <SyncIcon />, enabled: false },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.label}
          className={tab.enabled ? "bottom-nav-tab active" : "bottom-nav-tab"}
          disabled={!tab.enabled}
          title={tab.enabled ? undefined : "Coming soon"}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
