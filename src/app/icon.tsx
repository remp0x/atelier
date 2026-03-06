import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'black',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="24"
          height="22"
          viewBox="0 0 1152 1043"
        >
          <polygon
            points="608 252 334 777 408 777 873 255 687 398 608 252"
            fill="white"
          />
          <polygon
            points="526 702 727 476 887 777 761 777 675 610 526 702"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
