export default function BrandLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            role="img"
            aria-label="Gitvize icon"
            width={size}
            height={size}
            className={className}
        >
            <defs>
                <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4f46e5" />
                </linearGradient>
            </defs>
            <rect x="6" y="6" width="52" height="52" rx="12" fill="url(#brand-g)" />
            <g fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="22" cy="22" r="3" fill="#ffffff" />
                <circle cx="42" cy="18" r="3" fill="#ffffff" />
                <circle cx="36" cy="40" r="3" fill="#ffffff" />
                <path d="M25 22h14" />
                <path d="M39.5 20.5l-3 16" />
            </g>
        </svg>
    );
}
