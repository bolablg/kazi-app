/** Keep these paths aligned with public/brand/kazi-mark.svg and index.html. */
export function LoadingSignal() {
  return (
    <svg
      className="loading-signal"
      viewBox="0 -24 480 424"
      width="480"
      height="424"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="loading-step"
        fill="#FF8A32"
        d="M4 331c0-16 7-30 19-40l82-69c18-15 42-2 42 21v94c0 18-14 33-32 33H41c-21 0-37-17-37-39Z"
      />
      <path
        className="loading-step"
        fill="#E9488B"
        d="M175 201c0-14 7-27 19-37l76-60c17-13 39-2 39 19v70c0 10-2 15-8 21l-46 45c-7 8-8 18-1 26l55 60c8 8 3 25-9 25h-96c-16 0-29-13-29-29Z"
      />
      <path
        className="loading-step"
        fill="#4263EB"
        d="M339 98c0-11 6-22 17-31l61-52c16-14 36-14 52 0 7 6 7 17 7 29v293c0 18-14 33-32 33h-32c-14 0-25-4-35-16l-60-65c-11-12-11-21 0-33l84-84c3-3 2-4-2-4h-60Z"
      />
    </svg>
  );
}
