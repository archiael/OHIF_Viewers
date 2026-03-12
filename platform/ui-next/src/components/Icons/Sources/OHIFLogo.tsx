import React from 'react';
import type { IconProps } from '../types';

export const OHIFLogo = (props: IconProps) => (
  <svg
    width="200"
    height="40"
    viewBox="0 0 200 40"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {/* Icon */}
    <g transform="translate(2, 5)">
      <rect
        x="0"
        y="0"
        width="30"
        height="30"
        rx="6"
        ry="6"
        fill="#1F2933"
      />
      <polyline
        points="6,21.5 10,8.5 15,16.5 20,8.5 24,21.5"
        fill="none"
        stroke="#38BDF8"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="6.5"
        y1="24"
        x2="23.5"
        y2="24"
        stroke="#FBBF24"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </g>

    {/* Text */}
    <text
      x="40"
      y="27"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontSize="18"
      fontWeight="700"
      fill="#FFFFFF"
    >
      MP VIEW<tspan fill="#38BDF8">-WEB</tspan>
    </text>
  </svg>
);

export default OHIFLogo;
