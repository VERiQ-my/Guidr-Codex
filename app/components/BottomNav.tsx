"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { usePrefs } from "@/app/context/PrefsContext";
import { useUser } from "@/app/context/UserContext";
import NotificationsBell from "@/app/components/NotificationsBell";

export default function BottomNav() {
  const pathname = usePathname();
  const { tr } = usePrefs();
  const { user } = useUser();

  const navItems = [
    {
      href: "/",
      label: tr("nav.home"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: "/analytics",
      label: tr("nav.analytics"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      href: "/scan",
      label: tr("nav.scan"),
      isBrandIcon: true,
      icon: () => null,
    },
    {
      href: "/learn",
      label: tr("nav.learn"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      href: "/profile",
      label: tr("nav.profile"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* MOBILE / TABLET — bottom navigation bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-2px_20px_rgba(0,0,0,0.04)]">
        <div className="max-w-md mx-auto flex items-end px-2 pt-2 pb-nav-safe">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.isBrandIcon) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-1 flex-col items-center -mt-5 pb-1 group"
                  aria-label={item.label}
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg overflow-hidden transition-transform group-hover:scale-105 group-active:scale-95 ${isActive
                      ? "bg-guidr-primary ring-4 ring-guidr-primary/20"
                      : "bg-white ring-2 ring-gray-100"
                    }`}>
                    <Image
                      src="/images/Brand Icon.png"
                      alt="Scan"
                      width={40}
                      height={40}
                      className="object-contain scale-[1.8]"
                    />
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${isActive ? "text-guidr-primary" : "text-guidr-muted"
                    }`}>
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center gap-0.5 py-1 group"
                aria-label={item.label}
              >
                <div className="transition-transform group-hover:scale-110 group-active:scale-95">
                  {item.icon(isActive)}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-guidr-primary" : "text-guidr-muted"
                  }`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* DESKTOP — fixed left sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-40 h-screen w-60 flex-col bg-white border-r border-gray-100 shadow-[2px_0_20px_rgba(0,0,0,0.03)]">
        <Link href="/" className="flex items-center gap-2 px-5 h-20 shrink-0 border-b border-gray-100">
          <div className="w-10 h-10 relative overflow-hidden shrink-0">
            <Image
              src="/images/Brand Icon.png"
              alt="Guidr"
              fill
              className="object-contain scale-[1.7]"
              sizes="40px"
            />
          </div>
          <Image
            src="/images/Brand Logo.png"
            alt="Guidr"
            width={400}
            height={100}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-5 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.isBrandIcon) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 my-2 rounded-xl font-semibold transition-all active:scale-[0.98] ${isActive
                      ? "bg-guidr-primary text-white shadow-lg shadow-guidr-primary/20"
                      : "bg-guidr-primary-dark text-white hover:bg-guidr-primary shadow-md shadow-guidr-primary/10"
                    }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {item.label}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${isActive
                    ? "bg-guidr-primary-light text-guidr-primary"
                    : "text-guidr-muted hover:bg-gray-50 hover:text-guidr-text"
                  }`}
              >
                {item.icon(isActive)}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-gray-100 shrink-0 flex flex-col gap-1">
          <NotificationsBell placement="sidebar" />

          <Link
            href="/profile"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${pathname === "/profile" ? "bg-guidr-primary-light" : "hover:bg-gray-50"
              }`}
          >
            <div className="shrink-0 w-9 h-9 rounded-full bg-guidr-primary-light flex items-center justify-center overflow-hidden border border-gray-100">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-guidr-primary">
                  {user?.fullName?.charAt(0).toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-guidr-text truncate">{user?.fullName || "Guest"}</p>
              <p className="text-xs text-guidr-muted truncate">@{user?.username || "user"}</p>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
