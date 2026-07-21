export function MicrosoftButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-700 shadow-xs transition-all duration-150 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="#f25022" d="M0 0h7.6v7.6H0z" />
        <path fill="#00a4ef" d="M8.4 0H16v7.6H8.4z" />
        <path fill="#7fba00" d="M0 8.4h7.6V16H0z" />
        <path fill="#ffb900" d="M8.4 8.4H16V16H8.4z" />
      </svg>
      Continue with Microsoft
    </button>
  )
}
