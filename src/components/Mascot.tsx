/**
 * 몽실이 — the app's own mascot: a round marshmallow critter drawn for this app.
 */
export type Mood = "happy" | "wow" | "sad" | "sleep" | "wink";

const INK = "#4a3a30";

export function Mascot({
  mood = "happy",
  size = 96,
  className = "",
  title,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <ellipse cx="60" cy="110" rx="30" ry="4.5" fill={INK} opacity="0.08" />
      {/* ears */}
      <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
        <path d="M30 40 C24 22 36 14 46 26 Z" fill="#fff" />
        <path d="M90 40 C96 22 84 14 74 26 Z" fill="#fff" />
      </g>
      <path d="M33 34 C31 26 37 23 41 28" fill="none" stroke="#ffb0c4" strokeWidth="3" strokeLinecap="round" />
      <path d="M87 34 C89 26 83 23 79 28" fill="none" stroke="#ffb0c4" strokeWidth="3" strokeLinecap="round" />
      {/* body */}
      <path
        d="M60 24 C90 24 106 46 106 72 C106 96 88 107 60 107 C32 107 14 96 14 72 C14 46 30 24 60 24 Z"
        fill="#fff"
        stroke={INK}
        strokeWidth="2.6"
      />
      {/* little arms */}
      <path d="M20 78 C14 82 15 90 22 89" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M100 78 C106 82 105 90 98 89" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      {/* cheeks */}
      <ellipse cx="36" cy="76" rx="7.5" ry="4.6" fill="#ffb0c4" opacity="0.85" />
      <ellipse cx="84" cy="76" rx="7.5" ry="4.6" fill="#ffb0c4" opacity="0.85" />
      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: Mood }) {
  const stroke = { stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "wow":
      return (
        <g>
          <circle cx="46" cy="64" r="5.4" fill={INK} />
          <circle cx="74" cy="64" r="5.4" fill={INK} />
          <circle cx="47.8" cy="62" r="1.9" fill="#fff" />
          <circle cx="75.8" cy="62" r="1.9" fill="#fff" />
          <ellipse cx="60" cy="77" rx="4.2" ry="5" fill="#f2789a" stroke={INK} strokeWidth="2.2" />
          <path d="M100 40 l3 -7 M106 46 l7 -2 M95 36 l-1 -7" {...stroke} stroke="#e9b52c" />
        </g>
      );
    case "sad":
      return (
        <g>
          <path d="M40 62 Q46 67 52 63" {...stroke} />
          <path d="M68 63 Q74 67 80 62" {...stroke} />
          <path d="M55 79 Q60 75 65 79" {...stroke} />
          <path d="M53 67 q-3 6 0 8 q3 -2 0 -8 Z" fill="#a9d9f2" stroke="#4fa7d6" strokeWidth="1.2" />
        </g>
      );
    case "sleep":
      return (
        <g>
          <path d="M40 64 Q46 68 52 64" {...stroke} />
          <path d="M68 64 Q74 68 80 64" {...stroke} />
          <path d="M57 76 Q60 78 63 76" {...stroke} />
          <text x="88" y="30" fontSize="14" fill={INK} fontFamily="sans-serif" fontWeight="700">z</text>
          <text x="98" y="20" fontSize="10" fill={INK} fontFamily="sans-serif" fontWeight="700">z</text>
        </g>
      );
    case "wink":
      return (
        <g>
          <circle cx="46" cy="64" r="4.4" fill={INK} />
          <circle cx="47.5" cy="62.5" r="1.4" fill="#fff" />
          <path d="M68 64 Q74 60 80 64" {...stroke} />
          <path d="M54 73 Q57 78 60 74 Q63 78 66 73" {...stroke} />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="46" cy="64" r="4.4" fill={INK} />
          <circle cx="74" cy="64" r="4.4" fill={INK} />
          <circle cx="47.5" cy="62.5" r="1.4" fill="#fff" />
          <circle cx="75.5" cy="62.5" r="1.4" fill="#fff" />
          <path d="M54 73 Q57 78 60 74 Q63 78 66 73" {...stroke} />
        </g>
      );
  }
}
