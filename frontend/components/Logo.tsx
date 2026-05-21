export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale = size === "lg" ? 1.3 : size === "sm" ? 0.88 : 1;
  const w = Math.round(278 * scale);
  const h = Math.round(66 * scale);

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 278 66"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NRAIORBIT SmartJobApply"
    >
      <defs>
        {/* Planet — bright indigo core with soft highlight */}
        <radialGradient id="lgPlanet" cx="36%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#a5b4fc" />
          <stop offset="40%"  stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3730a3" />
        </radialGradient>

        {/* Orbit ring — vivid fuchsia → violet */}
        <linearGradient id="lgRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#e879f9" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>

        {/* NRAIORBIT text — white → soft lavender */}
        <linearGradient id="lgBrand" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="60%"  stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>

        {/* "Job" accent — indigo → violet */}
        <linearGradient id="lgAccent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* Outer glow on planet */}
        <filter id="lgPlanetGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Glow on satellite dot */}
        <filter id="lgSatGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Show only bottom half of orbit (in front of planet) */}
        <clipPath id="lgFront">
          <rect x="-45" y="0" width="90" height="45" />
        </clipPath>

        {/* Show only top half of orbit (behind planet) */}
        <clipPath id="lgBack">
          <rect x="-45" y="-45" width="90" height="45" />
        </clipPath>
      </defs>

      {/* ── Icon: planet + 3-D orbit ring ── */}
      <g transform="translate(33,33)">
        {/* Soft ambient halo */}
        <circle r="30" fill="#4f46e5" opacity="0.10" />
        <circle r="22" fill="#6366f1" opacity="0.12" />

        {/* Back arc of orbit (dimmer, goes "behind" the planet) */}
        <ellipse
          rx="29" ry="12"
          stroke="url(#lgRing)" strokeWidth="4.5" fill="none"
          opacity="0.38"
          clipPath="url(#lgBack)"
        />

        {/* Planet body — solid filled circle */}
        <circle r="18" fill="url(#lgPlanet)" filter="url(#lgPlanetGlow)" />

        {/* Specular highlight on planet surface */}
        <ellipse rx="8" ry="5.5" cx="-5" cy="-6" fill="white" opacity="0.22" />

        {/* Front arc of orbit (bright, overlaps planet in front) */}
        <ellipse
          rx="29" ry="12"
          stroke="url(#lgRing)" strokeWidth="5.5" fill="none"
          clipPath="url(#lgFront)"
        />

        {/* Satellite dot — bright pink */}
        <circle cx="29" cy="0" r="4" fill="#f9a8d4" filter="url(#lgSatGlow)" />
        <circle cx="29" cy="0" r="2.2" fill="#fdf4ff" />
      </g>

      {/* ── NRAIORBIT ── */}
      <text
        x="70"
        y="24"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize="19"
        letterSpacing="3.5"
        fill="url(#lgBrand)"
      >
        NRAIORBIT
      </text>

      {/* Thin accent line between brand and product name */}
      <line x1="70" y1="30" x2="274" y2="30" stroke="url(#lgRing)" strokeWidth="1" opacity="0.5" />

      {/* ── SmartJobApply ── */}
      <text
        x="70"
        y="55"
        fontFamily="'Arial Bold', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="22"
        fill="white"
      >
        Smart
        <tspan fill="url(#lgAccent)">Job</tspan>
        Apply
      </text>
    </svg>
  );
}
