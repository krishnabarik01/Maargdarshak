import React from 'react';
import { mToPx, DIMENSIONS } from '../utils/lotGeometry';

/**
 * Realistic Top-Down Car Sprite
 * Dimensions: 1.8m × 4.3m
 * Features:
 * - Rounded aerodynamic body
 * - Windshield and curved rear window
 * - Dual side mirrors
 * - 4 visible wheels with rubber tread
 * - Dual warm-white headlights
 * - Dual red LED taillights
 * - Roof panel with optional EV cyan bolt
 */
export function CarSprite({
  variant = 'blue', // 'blue' | 'white' | 'silver'
  isEv = false,
  rotation = 0, // degrees
  plate = 'KA-01-CR-1000'
}) {
  const widthPx = mToPx(DIMENSIONS.CAR_VEHICLE.width); // 43.2 px
  const lengthPx = mToPx(DIMENSIONS.CAR_VEHICLE.length); // 103.2 px
  const wheelW = mToPx(DIMENSIONS.CAR_VEHICLE.wheelWidth); // 5.28 px
  const wheelL = mToPx(DIMENSIONS.CAR_VEHICLE.wheelLength); // 15.6 px

  const bodyColors = {
    blue: { base: '#1E3A8A', highlight: '#2563EB', roof: '#1D4ED8', border: '#60A5FA' },
    white: { base: '#F1F5F9', highlight: '#FFFFFF', roof: '#E2E8F0', border: '#CBD5E1' },
    silver: { base: '#64748B', highlight: '#94A3B8', roof: '#475569', border: '#CBD5E1' },
  };

  const scheme = bodyColors[variant] || bodyColors.blue;

  return (
    <g transform={`rotate(${rotation})`} className="select-none pointer-events-none">
      {/* 4 Wheels (Mounted outside chassis boundary for realistic stance) */}
      {/* Front-Left Wheel */}
      <rect
        x={-widthPx / 2 - wheelW / 2 + 1}
        y={-lengthPx / 2 + 12}
        width={wheelW}
        height={wheelL}
        rx="2"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="0.8"
      />
      {/* Front-Right Wheel */}
      <rect
        x={widthPx / 2 - wheelW / 2 - 1}
        y={-lengthPx / 2 + 12}
        width={wheelW}
        height={wheelL}
        rx="2"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="0.8"
      />
      {/* Rear-Left Wheel */}
      <rect
        x={-widthPx / 2 - wheelW / 2 + 1}
        y={lengthPx / 2 - wheelL - 12}
        width={wheelW}
        height={wheelL}
        rx="2"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="0.8"
      />
      {/* Rear-Right Wheel */}
      <rect
        x={widthPx / 2 - wheelW / 2 - 1}
        y={lengthPx / 2 - wheelL - 12}
        width={wheelW}
        height={wheelL}
        rx="2"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="0.8"
      />

      {/* Main Aerodynamic Chassis */}
      <rect
        x={-widthPx / 2}
        y={-lengthPx / 2}
        width={widthPx}
        height={lengthPx}
        rx="10"
        fill={scheme.base}
        stroke={scheme.border}
        strokeWidth="1.2"
      />

      {/* Hood crease line */}
      <path
        d={`M ${-widthPx / 2 + 6} ${-lengthPx / 2 + 6} Q 0 ${-lengthPx / 2 + 12} ${widthPx / 2 - 6} ${-lengthPx / 2 + 6}`}
        stroke={scheme.border}
        strokeWidth="0.8"
        fill="none"
        opacity="0.6"
      />

      {/* Headlights (Warm White / Yellow glow) */}
      <ellipse cx={-widthPx / 2 + 6} cy={-lengthPx / 2 + 3} rx="3" ry="1.8" fill="#FEF08A" />
      <ellipse cx={widthPx / 2 - 6} cy={-lengthPx / 2 + 3} rx="3" ry="1.8" fill="#FEF08A" />

      {/* Side Mirrors */}
      <rect
        x={-widthPx / 2 - 4}
        y={-lengthPx / 2 + 28}
        width="4"
        height="6"
        rx="1.5"
        fill={scheme.base}
        stroke={scheme.border}
        strokeWidth="0.8"
      />
      <rect
        x={widthPx / 2}
        y={-lengthPx / 2 + 28}
        width="4"
        height="6"
        rx="1.5"
        fill={scheme.base}
        stroke={scheme.border}
        strokeWidth="0.8"
      />

      {/* Front Windshield (Dark Glass with glare) */}
      <path
        d={`M ${-widthPx / 2 + 5} ${-lengthPx / 2 + 30} L ${widthPx / 2 - 5} ${-lengthPx / 2 + 30} L ${widthPx / 2 - 7} ${-lengthPx / 2 + 45} L ${-widthPx / 2 + 7} ${-lengthPx / 2 + 45} Z`}
        fill="#0B132B"
        stroke="#1E293B"
        strokeWidth="0.8"
      />
      {/* Windshield subtle glare stripe */}
      <path
        d={`M ${-widthPx / 2 + 10} ${-lengthPx / 2 + 33} L ${-widthPx / 2 + 18} ${-lengthPx / 2 + 33} L ${-widthPx / 2 + 14} ${-lengthPx / 2 + 43} L ${-widthPx / 2 + 8} ${-lengthPx / 2 + 43} Z`}
        fill="#FFFFFF"
        opacity="0.15"
      />

      {/* Cabin Roof */}
      <rect
        x={-widthPx / 2 + 6}
        y={-lengthPx / 2 + 45}
        width={widthPx - 12}
        height={lengthPx - 76}
        rx="4"
        fill={scheme.roof}
        stroke={scheme.border}
        strokeWidth="0.6"
      />

      {/* EV Cyan Lightning Glyph if electric */}
      {isEv && (
        <g transform="translate(0, -2)">
          <circle cx="0" cy="0" r="6" fill="#083344" stroke="#06B6D4" strokeWidth="1" />
          <path
            d="M 1 -4 L -2 0 H 2 L -1 4"
            stroke="#06B6D4"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Rear Window */}
      <path
        d={`M ${-widthPx / 2 + 7} ${lengthPx / 2 - 31} L ${widthPx / 2 - 7} ${lengthPx / 2 - 31} L ${widthPx / 2 - 5} ${lengthPx / 2 - 18} L ${-widthPx / 2 + 5} ${lengthPx / 2 - 18} Z`}
        fill="#0B132B"
        stroke="#1E293B"
        strokeWidth="0.8"
      />

      {/* Taillights (Vibrant Red) */}
      <rect x={-widthPx / 2 + 5} y={lengthPx / 2 - 4} width="7" height="2.5" rx="1" fill="#EF4444" />
      <rect x={widthPx / 2 - 12} y={lengthPx / 2 - 4} width="7" height="2.5" rx="1" fill="#EF4444" />
    </g>
  );
}

/**
 * Realistic Top-Down Two-Wheeler Sprite
 * Dimensions: 0.8m × 2.0m
 * Features:
 * - Front and rear visible motorcycle wheels
 * - Handlebar with grips and side mirrors
 * - Sculpted fuel tank and exhaust pipe
 * - Two-tier seat with helmet silhouette (rider)
 * - Front headlamp & rear brake light
 */
export function BikeSprite({
  rotation = 0, // degrees
  plate = 'KA-05-BK-2000'
}) {
  const widthPx = mToPx(DIMENSIONS.BIKE_VEHICLE.width); // 19.2 px
  const lengthPx = mToPx(DIMENSIONS.BIKE_VEHICLE.length); // 48.0 px
  const wheelW = mToPx(DIMENSIONS.BIKE_VEHICLE.wheelWidth); // 2.88 px
  const wheelL = mToPx(DIMENSIONS.BIKE_VEHICLE.wheelLength); // 14.4 px

  return (
    <g transform={`rotate(${rotation})`} className="select-none pointer-events-none">
      {/* Front Tire (Centrally aligned at front) */}
      <rect
        x={-wheelW / 2}
        y={-lengthPx / 2 + 2}
        width={wheelW}
        height={wheelL}
        rx="1.5"
        fill="#0F172A"
        stroke="#475569"
        strokeWidth="0.6"
      />

      {/* Rear Tire (Centrally aligned at back) */}
      <rect
        x={-wheelW / 2}
        y={lengthPx / 2 - wheelL - 2}
        width={wheelW}
        height={wheelL}
        rx="1.5"
        fill="#0F172A"
        stroke="#475569"
        strokeWidth="0.6"
      />

      {/* Exhaust Pipe (Right side) */}
      <rect
        x={wheelW / 2 + 1.5}
        y={lengthPx / 2 - 16}
        width="2"
        height="12"
        rx="1"
        fill="#94A3B8"
      />

      {/* Handlebar crossbar & grips */}
      <line
        x1={-widthPx / 2 + 1}
        y1={-lengthPx / 2 + 12}
        x2={widthPx / 2 - 1}
        y2={-lengthPx / 2 + 12}
        stroke="#64748B"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Left Grip */}
      <circle cx={-widthPx / 2 + 2} cy={-lengthPx / 2 + 12} r="1.5" fill="#0F172A" />
      {/* Right Grip */}
      <circle cx={widthPx / 2 - 2} cy={-lengthPx / 2 + 12} r="1.5" fill="#0F172A" />

      {/* Headlamp (Front center) */}
      <ellipse cx="0" cy={-lengthPx / 2 + 1} rx="2.5" ry="1.2" fill="#FEF08A" />

      {/* Fuel Tank (Teal / Cyan bodywork) */}
      <path
        d={`M -4.5 ${-lengthPx / 2 + 14} Q 0 ${-lengthPx / 2 + 11} 4.5 ${-lengthPx / 2 + 14} L 3.5 ${-lengthPx / 2 + 25} L -3.5 ${-lengthPx / 2 + 25} Z`}
        fill="#0D9488"
        stroke="#14B8A6"
        strokeWidth="0.8"
      />

      {/* Black Leather Seat */}
      <path
        d={`M -3.2 ${-lengthPx / 2 + 25} L 3.2 ${-lengthPx / 2 + 25} Q 3 ${lengthPx / 2 - 6} 0 ${lengthPx / 2 - 5} Q -3 ${lengthPx / 2 - 6} -3.2 ${-lengthPx / 2 + 25} Z`}
        fill="#1E293B"
        stroke="#334155"
        strokeWidth="0.7"
      />

      {/* Rider Helmet / Silhouette (Top view) */}
      <circle cx="0" cy={-lengthPx / 2 + 23} r="3.8" fill="#3B82F6" stroke="#93C5FD" strokeWidth="0.6" />
      <path d="M -2.5 -2 L 2.5 -2" stroke="#0F172A" strokeWidth="1" />

      {/* Rear Brake Light */}
      <rect x="-2.5" y={lengthPx / 2 - 3} width="5" height="1.8" rx="0.8" fill="#EF4444" />
    </g>
  );
}
