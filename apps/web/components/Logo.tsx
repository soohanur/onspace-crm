export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-flex items-center justify-center rounded-md"
        style={{ width: size, height: size, background: '#0A0A0A' }}
      >
        <svg
          width={size * 0.78}
          height={size * 0.78}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* Outer ring with split */}
          <path
            d="M32 4 a28 28 0 1 1 -0.01 0"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          {/* Middle ring with split */}
          <path
            d="M32 14 a18 18 0 1 1 -0.01 0"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          {/* Inner ring with split */}
          <path
            d="M32 24 a8 8 0 1 1 -0.01 0"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          {/* Center dot */}
          <circle cx="32" cy="32" r="3.6" fill="#fff" />
        </svg>
      </span>
      {withText && (
        <span className="font-bold tracking-tight text-[15px] leading-none">
          Onspace<span className="text-primary">CRM</span>
        </span>
      )}
    </div>
  );
}
