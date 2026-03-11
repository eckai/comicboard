import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, className = '' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative z-50 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl ${className}`}>
        {title && (
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 text-lg font-semibold">{title}</div>
            <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
