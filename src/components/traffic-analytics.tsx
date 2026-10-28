"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const panelRef = useRef<HTMLDivElement>(null);
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
    <Dialog open={showChoice} onOpenChange={setShowChoice}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="xs" className="analytics-choice-trigger" aria-label="Analytics choice" title="Analytics choice">
          <Cookie className="analytics-trigger-icon size-4" aria-hidden="true" /><span className="analytics-trigger-label">Analytics choice</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={panelRef}
        tabIndex={-1}
        className="analytics-panel sm:max-w-[480px]"
        onOpenAutoFocus={(event) => { event.preventDefault(); panelRef.current?.focus(); }}
      >
        <DialogHeader>
          <DialogTitle>Analytics preferences</DialogTitle>
          <DialogDescription>Optional Google Analytics records page views so we can see traffic over time.</DialogDescription>
        </DialogHeader>
        <div className="analytics-panel-body">
          <p>Page views use broad categories instead of repository names. You can change your choice anytime.</p>
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">How Google uses data</a>
          <p className="analytics-current-choice" role="status">
            {consent === "granted" ? "Current choice: analytics allowed." : consent === "denied" ? "Current choice: analytics declined." : "No choice saved. Analytics is off."}
          </p>
          <p className="analytics-choice-note">Closing this panel does not save or change your choice.</p>
        </div>
        <DialogFooter className="analytics-panel-actions">
          <Button type="button" onClick={() => choose("granted")}>Allow analytics</Button>
          <Button type="button" variant="outline" onClick={() => choose("denied")}>No thanks</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
