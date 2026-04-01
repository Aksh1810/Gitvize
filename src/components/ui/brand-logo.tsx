export default function BrandLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
    return (
        <img
            src="/brand-logo.svg"
            alt="Gitvize"
            width={size}
            height={size}
            className={className}
            style={{ borderRadius: "25%", display: "block" }}
        />
    );
}
