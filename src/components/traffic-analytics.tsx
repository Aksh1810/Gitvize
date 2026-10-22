"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const MEASUREMENT_ID = "G-2ZFGF7B4L6";
const CONSENT_KEY = "gitvize.analytics-consent";

type Consent = "granted" | "denied" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export default function TrafficAnalytics() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent>(null);
  const [showChoice, setShowChoice] = useState(false);
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(CONSENT_KEY);
    if (saved === "granted" || saved === "denied") {
      setConsent(saved);
    } else {
      setShowChoice(true);
    }
  }, []);

  useEffect(() => {
    if (consent !== "granted" || lastPathname.current === pathname) return;

    // Repository names in the URL may be private. Record only the page category.
    const page = pathname === "/" ? "/" : "/repository";
    const pageLocation = `${window.location.origin}${page}`;
    const pageTitle = page === "/" ? "Gitvize home" : "Gitvize repository";

    window.dataLayer ??= [];
    window.gtag ??= function () {
      // Google tag expects the Arguments object, not a rest-parameter array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };

    if (!document.getElementById("gitvize-google-analytics")) {
      window.gtag("js", new Date());
      const script = document.createElement("script");
      script.id = "gitvize-google-analytics";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }

    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      page_location: pageLocation,
      page_title: pageTitle,
    });
    window.gtag("event", "page_view", {
      page_location: pageLocation,
      page_title: pageTitle,
    });
    lastPathname.current = pathname;
  }, [consent, pathname]);

  function choose(value: Exclude<Consent, null>) {
    localStorage.setItem(CONSENT_KEY, value);
    setShowChoice(false);
    if (consent === "granted" && value === "denied") {
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (name !== "_ga" && !name.startsWith("_ga_")) continue;
        document.cookie = `${name}=; Max-Age=0; Path=/`;
        if (window.location.hostname === "gitvize.com" || window.location.hostname.endsWith(".gitvize.com")) {
          document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.gitvize.com`;
        }
      }
      window.location.reload();
      return;
    }
    setConsent(value);
  }

  return (
    <>
      {consent && !showChoice && (
        <button
          type="button"
          className="fixed bottom-3 left-3 z-[100] rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
          onClick={() => setShowChoice(true)}
        >
          Analytics choice
        </button>
      )}
      {showChoice && (
        <section
          aria-label="Optional analytics choice"
          className="fixed bottom-3 left-3 right-3 z-[100] max-w-lg rounded-xl border border-white/20 bg-[#101522] p-4 text-sm text-white shadow-xl sm:right-auto"
        >
          <p className="font-semibold">Help us count visits?</p>
          <p className="mt-1 text-slate-200">
            Optional Google Analytics records page views so we can see traffic over time.
            Page views use broad categories instead of repository names. You can change your choice anytime. {" "}
            <a
              className="underline"
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
            >
              How Google uses data
            </a>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-[#3159ed] px-3 py-1.5 font-medium text-white"
              onClick={() => choose("granted")}
            >
              Allow analytics
            </button>
            <button
              type="button"
              className="rounded-md border border-white/40 px-3 py-1.5 text-white"
              onClick={() => choose("denied")}
            >
              No thanks
            </button>
          </div>
        </section>
      )}
    </>
  );
}
