import { type ButtonHTMLAttributes, forwardRef } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-button hover:bg-indigo-500 active:bg-indigo-700 focus-visible:ring-indigo-500/40",
  secondary:
    "border border-neutral-200 bg-white text-neutral-800 shadow-card hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-neutral-400/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
  ghost:
    "bg-transparent text-neutral-600 hover:bg-neutral-100 focus-visible:ring-neutral-400/40 dark:text-neutral-300 dark:hover:bg-neutral-800",
  danger:
    "bg-red-600 text-white shadow-button hover:bg-red-500 active:bg-red-700 focus-visible:ring-red-500/40",
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  ),
)
Button.displayName = "Button"
