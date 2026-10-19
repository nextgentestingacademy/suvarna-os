import React from 'react';

interface JewelArtProps {
  category: string;
  className?: string;
}

export const JewelArt: React.FC<JewelArtProps> = ({ category, className = 'w-full h-full' }) => {
  const cat = category.toLowerCase();

  return (
    <svg
      className={className}
      viewBox="0 0 320 190"
      role="img"
      aria-label={`${category} jewellery illustration`}
    >
      <defs>
        <linearGradient id="suvarnaGoldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8c6428" />
          <stop offset="25%" stopColor="#f7df9b" />
          <stop offset="52%" stopColor="#b78330" />
          <stop offset="75%" stopColor="#ffedb9" />
          <stop offset="100%" stopColor="#986b2a" />
        </linearGradient>
        <radialGradient id="suvarnaStoneGrad">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d7c9ae" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="160" cy="160" rx="86" ry="9" fill="#542047" opacity="0.08" />

      {/* Specific Jewellery Art based on category */}
      {cat.includes('necklace') || cat.includes('bridal') ? (
        <g>
          <path
            d="M92 28 C100 104 137 135 160 135 C183 135 220 104 228 28"
            fill="none"
            stroke="url(#suvarnaGoldGrad)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M96 35 C111 91 139 117 160 117 C181 117 209 91 224 35"
            fill="none"
            stroke="#f8df9c"
            strokeWidth="2"
          />
          <path
            d="M160 110 L178 132 L160 158 L142 132 Z"
            fill="url(#suvarnaGoldGrad)"
            stroke="#fff0bd"
            strokeWidth="2"
          />
          <circle cx="160" cy="132" r="8" fill="#fffdfa" stroke="#c7a45e" strokeWidth="3" />
        </g>
      ) : cat.includes('bangle') ? (
        <g>
          <ellipse
            cx="160"
            cy="95"
            rx="70"
            ry="48"
            fill="none"
            stroke="url(#suvarnaGoldGrad)"
            strokeWidth="16"
          />
          <ellipse cx="160" cy="95" rx="70" ry="48" fill="none" stroke="#f9e5ae" strokeWidth="3" />
          <ellipse cx="160" cy="95" rx="48" ry="32" fill="none" stroke="#a67b34" strokeWidth="2" />
          <circle cx="105" cy="66" r="4" fill="#fff2c9" />
          <circle cx="215" cy="66" r="4" fill="#fff2c9" />
          <circle cx="105" cy="124" r="4" fill="#fff2c9" />
          <circle cx="215" cy="124" r="4" fill="#fff2c9" />
        </g>
      ) : cat.includes('earring') ? (
        <g>
          <circle cx="125" cy="46" r="14" fill="none" stroke="url(#suvarnaGoldGrad)" strokeWidth="5" />
          <circle cx="195" cy="46" r="14" fill="none" stroke="url(#suvarnaGoldGrad)" strokeWidth="5" />
          <path d="M125 60 L125 86 M195 60 L195 86" stroke="url(#suvarnaGoldGrad)" strokeWidth="4" />
          <path
            d="M125 82 C94 102 103 145 125 154 C147 145 156 102 125 82Z"
            fill="url(#suvarnaGoldGrad)"
            stroke="#fff0bd"
            strokeWidth="2"
          />
          <path
            d="M195 82 C164 102 173 145 195 154 C217 145 226 102 195 82Z"
            fill="url(#suvarnaGoldGrad)"
            stroke="#fff0bd"
            strokeWidth="2"
          />
          <circle cx="125" cy="117" r="9" fill="#f8f3e8" stroke="#d49a24" strokeWidth="2" />
          <circle cx="195" cy="117" r="9" fill="#f8f3e8" stroke="#d49a24" strokeWidth="2" />
        </g>
      ) : cat.includes('chain') ? (
        <g>
          <path
            d="M92 26 C105 90 128 126 160 145 C192 126 215 90 228 26"
            fill="none"
            stroke="url(#suvarnaGoldGrad)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M92 26 C105 90 128 126 160 145 C192 126 215 90 228 26"
            fill="none"
            stroke="#fff0bd"
            strokeWidth="2"
            strokeDasharray="3 7"
          />
          <circle cx="160" cy="145" r="12" fill="url(#suvarnaGoldGrad)" stroke="#fff0bd" strokeWidth="2" />
        </g>
      ) : (
        /* Pendant & Default */
        <g transform="translate(160 96)">
          <ellipse rx="54" ry="48" fill="none" stroke="url(#suvarnaGoldGrad)" strokeWidth="14" />
          <ellipse rx="54" ry="48" fill="none" stroke="#fff0bd" strokeWidth="2" />
          <path d="M0 -33 L32 0 L0 33 L-32 0 Z" fill="url(#suvarnaGoldGrad)" stroke="#fff0bd" strokeWidth="2" />
          <circle r="12" fill="#f8f2e6" stroke="#b88c45" strokeWidth="3" />
        </g>
      )}

      <text
        x="160"
        y="180"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="8"
        letterSpacing="2"
        fill="#7c6746"
        opacity="0.7"
      >
        SUVARNA JEWELLERY CATALOGUE
      </text>
    </svg>
  );
};
