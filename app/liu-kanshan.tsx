type LiuKanshanProps = {
  className?: string
  pose?: "guide" | "thinking" | "verdict"
  label?: string
}

export default function LiuKanshan({
  className = "",
  pose = "guide",
  label = "刘看山，决策陪审团引导员",
}: LiuKanshanProps) {
  return (
    <svg
      className={`liu-kanshan liu-kanshan-${pose} ${className}`}
      viewBox="0 0 240 260"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <g className="fox-tail">
        <path
          d="M151 195c46 11 75-21 63-56-6-18-22-29-38-24 18 12 21 29 11 42-8 10-23 11-40 6z"
          fill="#f8fbff"
          stroke="#183153"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path d="M187 119c14 7 21 24 16 39" fill="none" stroke="#d7e3ef" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path
        d="M76 141c-18 17-26 48-24 88 29 17 106 18 137-1-1-40-11-70-31-87z"
        fill="#fbfdff"
        stroke="#183153"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M63 229c-9 4-15 11-16 20h55l2-18" fill="#f8fbff" stroke="#183153" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M177 228c10 4 16 11 17 21h-55l-2-18" fill="#f8fbff" stroke="#183153" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M62 66 68 15l38 34c10-3 22-3 32 0l38-34 5 57c10 15 13 34 8 52-8 31-36 48-68 48s-61-17-69-48c-5-20 0-42 10-58z"
        fill="#fbfdff"
        stroke="#183153"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="m72 33 5 30 22-15z" fill="#cfe0ee" stroke="#183153" strokeWidth="4" strokeLinejoin="round" />
      <path d="m169 33-5 30-22-15z" fill="#cfe0ee" stroke="#183153" strokeWidth="4" strokeLinejoin="round" />
      <path d="M92 102c5 5 11 5 16 0M133 102c5 5 11 5 16 0" fill="none" stroke="#183153" strokeWidth="5" strokeLinecap="round" />
      <path d="M114 120c4-4 10-4 14 0-1 6-4 9-7 9s-6-3-7-9z" fill="#183153" />
      <path d="M121 129v7m0 0c-5 0-9 2-11 5m11-5c5 0 9 2 11 5" fill="none" stroke="#183153" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M81 157c22 14 59 14 80 0l-4 28c-22 12-50 12-72 0z" fill="#0066ff" stroke="#183153" strokeWidth="5" strokeLinejoin="round" />
      <path d="m124 181 19 3-7 38-18-18-12 13-5-37z" fill="#0077ed" stroke="#183153" strokeWidth="5" strokeLinejoin="round" />
      {pose === "verdict" ? (
        <g className="fox-stamp">
          <circle cx="187" cy="193" r="29" fill="#f5e8dc" stroke="#d8583f" strokeWidth="4" />
          <circle cx="187" cy="193" r="22" fill="none" stroke="#d8583f" strokeWidth="2" strokeDasharray="3 3" />
          <text x="187" y="202" textAnchor="middle" fontSize="25" fontWeight="700" fill="#d8583f">证</text>
        </g>
      ) : (
        <g className="fox-gavel" transform="rotate(-18 190 189)">
          <path d="m179 178 13 47" stroke="#183153" strokeWidth="8" strokeLinecap="round" />
          <path d="m157 165 37-19 12 23-37 19z" fill="#d7a756" stroke="#183153" strokeWidth="5" strokeLinejoin="round" />
          <path d="m164 157 12 23m18-34 12 23" stroke="#183153" strokeWidth="5" />
        </g>
      )}
      {pose === "thinking" && (
        <g fill="#0066ff">
          <circle cx="190" cy="73" r="4" />
          <circle cx="203" cy="61" r="6" opacity=".7" />
          <circle cx="217" cy="43" r="8" opacity=".4" />
        </g>
      )}
    </svg>
  )
}
