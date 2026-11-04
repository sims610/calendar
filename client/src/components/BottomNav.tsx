import type { ReactNode } from "react";
import { CalendarIcon, GearIcon, HomeIcon, MapPinIcon, PersonIcon } from "./Icons";

export type Page = "home" | "calendar" | "people" | "settings";

interface Tab {
  label: string;
  icon: ReactNode;
  /** The page the tab opens. Tabs without one aren't built yet and are shown greyed out. */
  page?: Page;
}

const TABS: Tab[] = [
  { label: "Home", icon: <HomeIcon />, page: "home" },
  { label: "Calendar", icon: <CalendarIcon />, page: "calendar" },
  { label: "Connections", icon: <PersonIcon />, page: "people" },
  { label: "Map", icon: <MapPinIcon /> },
  { label: "Settings", icon: <GearIcon />, page: "settings" },
];

interface BottomNavProps {
  currentPage: Page;
  onSelectPage: (page: Page) => void;
  /** Connection requests waiting for an answer, shown as a badge on the People tab. */
  pendingCount: number;
}

export function BottomNav({ currentPage, onSelectPage, pendingCount }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ label, icon, page }) => (
        <button
          key={label}
          className={page === currentPage ? "bottom-nav-tab active" : "bottom-nav-tab"}
          disabled={!page}
          title={page ? undefined : "Coming soon"}
          aria-current={page === currentPage ? "page" : undefined}
          onClick={() => page && onSelectPage(page)}
        >
          <span className="bottom-nav-icon">
            {icon}
            {page === "people" && pendingCount > 0 && (
              <span
                className="bottom-nav-badge"
                aria-label={pendingCount === 1 ? "1 request" : `${pendingCount} requests`}
              >
                {pendingCount}
              </span>
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
