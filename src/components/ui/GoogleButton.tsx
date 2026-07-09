export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="#4285F4" d="M15.68 8.18c0-.56-.05-1.1-.14-1.63H8v3.09h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.5-1.39 2.4-3.44 2.4-5.88z" />
        <path fill="#34A853" d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.58-2c-.72.48-1.63.77-2.71.77-2.08 0-3.85-1.41-4.48-3.3H.86v2.07A8 8 0 0 0 8 16z" />
        <path fill="#FBBC05" d="M3.52 9.53A4.8 4.8 0 0 1 3.27 8c0-.53.09-1.05.25-1.53V4.4H.86A8 8 0 0 0 0 8c0 1.29.31 2.5.86 3.6z" />
        <path fill="#EA4335" d="M8 3.18c1.18 0 2.23.4 3.06 1.2l2.29-2.29A7.94 7.94 0 0 0 8 0 8 8 0 0 0 .86 4.4l2.66 2.07C4.15 4.59 5.92 3.18 8 3.18z" />
      </svg>
      Continue with Google
    </button>
  )
}
