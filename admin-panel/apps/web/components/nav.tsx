"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNavRefresh } from "@/lib/nav-refresh-context";
import { useEffect } from "react";
import { CONTACT_LINKS, HOME_LOGO_URL } from "@/lib/contact-links";

const NAV_ITEMS: {
  href: string;
  label: string;
  /** Shorter label for compact mobile tab bar */
  labelMobile?: string;
  internal?: boolean;
  tabIcon: string;
}[] = [
  {
    href: "https://sparrowsvolleyball.com.au/shop",
    label: "Shop",
    internal: false,
    tabIcon: "/images/volleyball_logo.svg",
  },
  {
    href: "https://www.youtube.com/@SparrowsVolleyball/videos",
    label: "Videos",
    internal: false,
    tabIcon: "/images/pickleball_logo.svg",
  },
  {
    href: "/calendar",
    label: "Calendar",
    internal: true,
    tabIcon: "/images/volleyball.svg",
  },
  {
    href: "/ongoing",
    label: "Ongoing Tournament",
    labelMobile: "Ongoing",
    internal: true,
    tabIcon: "/images/pickleball.svg",
  },
  {
    href: "/profile",
    label: "My Profile",
    labelMobile: "Profile",
    internal: true,
    tabIcon: "/images/volleyball_outline.svg",
  },
];

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
    router.prefetch("/calendar");
    router.prefetch("/profile");
    router.prefetch("/ongoing");
  }, [router]);

  const linkClass = (path: string, internal?: boolean) => {
    if (!internal) return "nav-item";
    const isActive = path === "/calendar" ? pathname === "/" || pathname === "/calendar" : pathname === path;
    return isActive ? "nav-item nav-item-active" : "nav-item";
  };

  const linkClassMobile = (path: string, internal?: boolean) => {
    if (!internal) return "nav-mobile-item";
    const isActive = path === "/calendar" ? pathname === "/" || pathname === "/calendar" : pathname === path;
    return isActive ? "nav-mobile-item nav-mobile-item-active" : "nav-mobile-item";
  };

  const onInternalNavClick = (href: string) => {
    router.prefetch(href);
    if (href === "/calendar" || href === "/") {
      refreshCalendarInBackground();
      if (member?.id) refreshRegistrationsInBackground(member.id);
    }
    if (href === "/profile" && member?.id) {
      refreshRegistrationsInBackground(member.id);
    }
  };

  return (
    <>
      {/* Desktop / large tablet: top bar (unchanged layout, includes Contact Us) */}
      <nav className="nav nav-desktop" aria-label="Main">
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
              <Image
                src={img}
                alt=""
                width={36}
                height={36}
                className="nav-left-logo"
                loading="lazy"
                sizes="36px"
              />
            </a>
          ))}
        </span>
        {NAV_ITEMS.map(({ href, label, internal = true }) =>
          internal ? (
            <Link
              key={href}
              href={href}
              className={linkClass(href, true)}
              onClick={() => onInternalNavClick(href)}
            >
              <span className="nav-label">{label}</span>
            </Link>
          ) : (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="nav-item">
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
              <Image
                src={img}
                alt=""
                width={38}
                height={38}
                className="nav-contact-icon"
                loading="lazy"
                sizes="38px"
              />
            </a>
          ))}
        </span>
      </nav>

      {/* Phone / tablet: fixed bottom tab bar (text + icon), no Contact Us */}
      <nav className="nav-mobile-bottom" aria-label="Main">
        {NAV_ITEMS.map(({ href, label, labelMobile, internal = true, tabIcon }) => {
          const tabLabel = labelMobile ?? label;
          return internal ? (
            <Link
              key={href}
              href={href}
              className={linkClassMobile(href, true)}
              onClick={() => onInternalNavClick(href)}
            >
              <Image
                src={tabIcon}
                alt=""
                width={26}
                height={26}
                className="nav-mobile-tab-icon"
                loading="lazy"
                sizes="26px"
              />
              <span className="nav-mobile-tab-text">{tabLabel}</span>
            </Link>
          ) : (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassMobile(href, false)}
            >
              <Image
                src={tabIcon}
                alt=""
                width={26}
                height={26}
                className="nav-mobile-tab-icon"
                loading="lazy"
                sizes="26px"
              />
              <span className="nav-mobile-tab-text">{tabLabel}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
