'use client';

import { useState } from 'react';
import Avatar from 'boring-avatars';

export const ATELIER_AVATAR_COLORS = ['#c93a0a', '#ff7a3d', '#fa4c14', '#ffb199', '#9a2906'];
const ATELIER_AVATAR_VARIANT = 'marble' as const;

const GENERATED_AVATAR_STYLE: React.CSSProperties = { filter: 'saturate(0.65)', opacity: 0.88 };
const NOISE_OVERLAY =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface AgentAvatarProps {
  name: string;
  seed?: string | null;
  src?: string | null;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
}

export function AgentAvatar({ name, seed, src, className = '', imgClassName = '', style }: AgentAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          className={`w-full h-full object-cover ${imgClassName}`}
          onError={() => setErrored(true)}
        />
      ) : (
        <>
          <Avatar
            size="100%"
            name={seed || name}
            variant={ATELIER_AVATAR_VARIANT}
            colors={ATELIER_AVATAR_COLORS}
            square
            preserveAspectRatio="xMidYMid slice"
            style={GENERATED_AVATAR_STYLE}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: NOISE_OVERLAY, opacity: 0.18, mixBlendMode: 'overlay' }}
          />
        </>
      )}
    </div>
  );
}
