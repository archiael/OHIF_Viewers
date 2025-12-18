import React from 'react';
import type { IconProps } from '../types';

export const OHIFLogoColorDarkBackground = (props: IconProps) => (
  <svg
    width="320"
    height="81"
    viewBox="0 0 320 81"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {/* Icon */}
    <g transform="translate(10, 15)">
      <rect
        x="0"
        y="0"
        width="50"
        height="50"
        rx="10"
        ry="10"
        fill="#1F2933"
      />
      <polyline
        points="10,35.8 16.7,14.2 25,27.5 33.3,14.2 40,35.8"
        fill="none"
        stroke="#38BDF8"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10.8"
        y1="40"
        x2="39.2"
        y2="40"
        stroke="#FBBF24"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </g>

    {/* Text */}
    <text
      x="75"
      y="48"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontSize="32"
      fontWeight="700"
      fill="#FFFFFF"
    >
      MView<tspan fill="#38BDF8">-Web</tspan>
    </text>
  </svg>
);

export default OHIFLogoColorDarkBackground;
