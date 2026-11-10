import type { SectionResult } from "@/types";
import { sectionErrors } from "@/lib/section-result";

/** Text depends only on settled evidence, not progress ticks, sorting or selection. */
export default function SectionNotice({ section, label }: { section?: SectionResult<unknown>; label: string }) {
    if (!section || section.status === "ready") return null;
    const text = section.status === "pending" ? `${label} pending.` : [...new Set(sectionErrors(section).map(error => error.message))].join(" ");
    return <p role="status" aria-live="polite" aria-atomic="true" className="shrink-0 border-b border-border px-3 py-2 text-sm leading-5 text-muted-foreground break-words">{text}</p>;
}
