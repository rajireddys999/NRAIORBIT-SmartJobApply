export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale = size === "lg" ? 1 : size === "sm" ? 0.6 : 0.8;
  return (
    <svg
      width={220 * scale}
      height={52 * scale}
      viewBox="0 0 220 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NRAIORBIT SmartJobApply"
    >
      <defs>
        <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orbit icon — concentric ellipses around a core */}
      <g transform="translate(26,26)" filter="url(#glow)">
        {/* Core dot */}
        <circle r="5" fill="url(#orbitGrad)" />
        {/* Inner orbit ring */}
        <ellipse rx="13" ry="7" stroke="#6366f1" strokeWidth="1.5" fill="none" transform="rotate(-30)" />
        {/* Outer orbit ring */}
        <ellipse rx="21" ry="10" stroke="#a855f7" strokeWidth="1" fill="none" strokeDasharray="3 2" transform="rotate(20)" />
        {/* Satellite dots */}
        <circle cx="13" cy="0" r="2.5" fill="#6366f1" transform="rotate(-30)" />
        <circle cx="-21" cy="0" r="2" fill="#a855f7" transform="rotate(20)" />
        {/* Horizontal slash */}
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#e0e7ff" strokeWidth="0.8" opacity="0.4" />
      </g>

      {/* NRAIORBIT */}
      <text
        x="56"
        y="20"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight="900"
        fontSize="13"
        letterSpacing="2"
        fill="url(#textGrad)"
      >
        NRAIORBIT
      </text>

      {/* Divider line */}
      <line x1="56" y1="24" x2="214" y2="24" stroke="#6366f1" strokeWidth="0.6" opacity="0.6" />

      {/* SmartJobApply */}
      <text
        x="56"
        y="40"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="16"
        fill="white"
      >
        Smart
        <tspan fill="url(#orbitGrad)">Job</tspan>
        Apply
      </text>
    </svg>
  );
}
