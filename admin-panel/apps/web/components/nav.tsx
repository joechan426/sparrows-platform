"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNavRefresh } from "@/lib/nav-refresh-context";
import { useEffect } from "react";

const NAV_ITEMS: { href: string; label: string; internal?: boolean }[] = [
  { href: "https://sparrowsvolleyball.com.au/shop", label: "Shop", internal: false },
  { href: "https://www.youtube.com/@SparrowsVolleyball/videos", label: "Videos", internal: false },
  { href: "/calendar", label: "Calendar", internal: true },
  { href: "/ongoing", label: "Ongoing Tournament", internal: true },
  { href: "/profile", label: "My Profile", internal: true },
];

const CONTACT_LINKS = [
  { href: "https://ig.me/m/sparrowsvolleyball", img: "/images/volleyball.svg", label: "Volleyball" },
  { href: "https://ig.me/m/sparrowspickleball", img: "/images/pickleball.svg", label: "Pickleball" },
];

const HOME_LOGO_URL = "https://sparrowsvolleyball.com.au";
const LEFT_LOGOES = [
  { img: "/images/volleyball_logo.svg", label: "Sparrows Volleyball" },
  { img: "/images/pickleball_logo.svg", label: "Sparrows Pickleball" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { member } = useAuth();
  const { refreshCalendarInBackground, refreshRegistrationsInBackground } = useNavRefresh();

  useEffect(() => {
    // Prefetch heavy client routes so switching feels instant.
    router.prefetch("/calendar");
    router.prefetch("/profile");
    router.prefetch("/ongoing");
  }, [router]);

  const linkClass = (path: string, internal?: boolean) => {
    if (!internal) return "nav-item";
    const isActive = path === "/calendar" ? pathname === "/" || pathname === "/calendar" : pathname === path;
    return isActive ? "nav-item nav-item-active" : "nav-item";
  };

  return (
    <nav className="nav">
      <span className="nav-left-logos">
        {LEFT_LOGOES.map(({ img, label }) => (
          <a
            key={img}
            href={HOME_LOGO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-left-logo-link"
            aria-label={label}
          >
            <Image src={img} alt="" width={36} height={36} className="nav-left-logo" />
          </a>
        ))}
      </span>
      {NAV_ITEMS.map(({ href, label, internal = true }) =>
        internal ? (
          <Link
            key={href}
            href={href}
            className={linkClass(href, true)}
            onClick={() => {
              router.prefetch(href);
              // Background refresh only when user clicks nav items.
              if (href === "/calendar" || href === "/") {
                refreshCalendarInBackground();
                if (member?.id) refreshRegistrationsInBackground(member.id);
              }
              if (href === "/profile") {
                if (member?.id) refreshRegistrationsInBackground(member.id);
              }
            }}
          >
            <span className="nav-label">{label}</span>
          </Link>
        ) : (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
          >
            <span className="nav-label">{label}</span>
          </a>
        )
      )}
      <span className="nav-contact-wrap">
        <span className="nav-contact-label">Contact Us: </span>
        {CONTACT_LINKS.map(({ href, img, label }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item nav-item-contact-icon"
            aria-label={label}
          >
            <Image src={img} alt="" width={38} height={38} className="nav-contact-icon" />
          </a>
        ))}
      </span>
    </nav>
  );
}
