"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOut } from "@/app/login/actions";
import styles from "./NavBar.module.css";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home",    icon: "🏠" },
  { href: "/history",   label: "History",  icon: "📖" },
  { href: "/tasks",    label: "Tasks",   icon: "✏️" },
  { href: "/settings",  label: "Settings", icon: "⚙️" },
];

interface NavBarProps {
  householdName: string;
}

export function NavBar({ householdName }: NavBarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar */}
      <header className={styles.topBar}>
        <span className={styles.householdName}>{householdName}</span>
        <div className={styles.topActions}>
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="btn btn-ghost btn-sm"
              id="btn-sign-out"
              title="Sign out"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Bottom nav bar (PWA-style) */}
      <nav className={styles.bottomNav} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`nav-${item.label.toLowerCase()}`}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
