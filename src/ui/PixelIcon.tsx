import React from 'react';

export type IconName =
  | 'passport'
  | 'layers'
  | 'report'
  | 'events'
  | 'camera'
  | 'sun'
  | 'cloud'
  | 'rain'
  | 'storm'
  | 'haze'
  | 'moon'
  | 'soundOn'
  | 'soundOff'
  | 'signs'
  | 'refresh'
  | 'map'
  | 'close';

export const PixelIcon: React.FC<{ name: IconName; size?: number; color?: string }> = ({
  name,
  size = 14,
  color = 'currentColor',
}) => {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: color, shapeRendering: 'crispEdges' as const, 'aria-hidden': true };

  switch (name) {
    case 'passport':
      return (
        <svg {...p}>
          <path d="M3 2h10v12H3V2zm2 2v8h6V4H5zm1 1h4v2H6V5zm0 4h4v1H6V9z" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...p}>
          <path d="M7 2h2v1h2v1h2v1h1v2h-1v1h-2v1H9v1H7V9H5V8H3V7H2V5h1V4h2V3h2V2zm-4 8h2v1h2v1h2v-1h2v-1h2v2h-2v1H9v1H7v-1H5v-1H3v-2z" />
        </svg>
      );
    case 'report':
      return (
        <svg {...p}>
          <path d="M2 13h12v1H2v-1zm1-4h2v3H3V9zm4-3h2v6H7V6zm4-4h2v10h-2V2z" />
        </svg>
      );
    case 'events':
      return (
        <svg {...p}>
          <path d="M7 1h2v3h3v2H9v3h3v2H9v3H7v-3H4V9h3V6H4V4h3V1z" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...p}>
          <path d="M5 3h6l1 2h2v8H2V5h2l1-2zm1 4v4h4V7H6zm1 1h2v2H7V8z" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...p}>
          <path d="M7 1h2v2H7V1zm0 12h2v2H7v-2zM1 7h2v2H1V7zm12 0h2v2h-2V7zM3 3h2v2H3V3zm8 0h2v2h-2V3zM3 11h2v2H3v-2zm8 0h2v2h-2v-2zM5 5h6v6H5V5z" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...p}>
          <path d="M6 2h4v2H8v2H7v4h1v2h2v2H6v-1H4v-2H3V5h1V3h2V2z" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...p}>
          <path d="M5 4h5v1h2v2h2v4H2V8h1V6h2V4z" />
        </svg>
      );
    case 'haze':
      return (
        <svg {...p}>
          <path d="M2 4h12v2H2V4zm1 4h10v2H3V8zm-1 4h12v2H2v-2z" />
        </svg>
      );
    case 'rain':
      return (
        <svg {...p}>
          <path d="M5 2h5v1h2v2h2v4H2V6h1V4h2V2zm-1 9h2v3H4v-3zm4 0h2v3H8v-3zm4 0h2v3h-2v-3z" />
        </svg>
      );
    case 'storm':
      return (
        <svg {...p}>
          <path d="M5 2h5v1h2v2h2v4H2V6h1V4h2V2zm3 8h3l-2 2h2l-4 3v-3H5l3-2z" />
        </svg>
      );
    case 'soundOn':
      return (
        <svg {...p}>
          <path d="M2 6h3l4-3v10L5 10H2V6zm9-1h2v6h-2V5zm3-2h1v10h-1V3z" />
        </svg>
      );
    case 'soundOff':
      return (
        <svg {...p}>
          <path d="M2 6h3l4-3v10L5 10H2V6zm9 0h1v1h1V6h1v1h-1v2h1v1h-1V9h-1v1h-1V9h1V7h-1V6z" />
        </svg>
      );
    case 'signs':
      return (
        <svg {...p}>
          <path d="M2 3h12v6H9v4H7V9H2V3zm2 2v2h8V5H4z" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...p}>
          <path d="M4 3h7v2h2v3h-2V5H4v3H2V5h2V3zm8 5h2v3h-2v2H5v-2H3V8h2v3h7V8z" />
        </svg>
      );
    case 'map':
      return (
        <svg {...p}>
          <path d="M2 3h4v1h4V3h4v10h-4v-1H6v1H2V3zm2 2v6h2V5H4zm4 1v5h2V6H8zm4-1v6h1V5h-1z" />
        </svg>
      );
    case 'close':
      return (
        <svg {...p}>
          <path d="M3 3h2v2H3V3zm8 0h2v2h-2V3zM5 5h2v2H5V5zm4 0h2v2H9V5zM7 7h2v2H7V7zm-2 2h2v2H5V9zm4 0h2v2H9V9zm-6 2h2v2H3v-2zm8 0h2v2h-2v-2z" />
        </svg>
      );
  }
};
