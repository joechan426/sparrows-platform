import Image from "next/image";
import { CONTACT_LINKS } from "@/lib/contact-links";

/** Contact Us — shown on My Profile (guest and logged-in). */
export function ContactUsBlock() {
  return (
    <section className="profile-contact-section" aria-labelledby="profile-contact-us-heading">
      <h2 id="profile-contact-us-heading" className="profile-section-title">
        Contact Us
      </h2>
      <p className="profile-contact-hint">Message us on Instagram.</p>
      <div className="profile-contact-icons">
        {CONTACT_LINKS.map(({ href, img, label }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="profile-contact-link"
            aria-label={label}
          >
            <Image src={img} alt="" width={44} height={44} className="profile-contact-icon" loading="lazy" sizes="44px" />
            <span className="profile-contact-link-label">{label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
