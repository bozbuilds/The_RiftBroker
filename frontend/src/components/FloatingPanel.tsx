import type { ReactNode } from 'react'

interface FloatingPanelProps {
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly title: string
  readonly onClose: () => void
}

/**
 * Centered floating card container for Browse/Create/My Intel views.
 * Overlays the 3D star map with semi-transparent background.
 */
export function FloatingPanel({ children, footer, title, onClose }: FloatingPanelProps) {
  return (
    <div className="floating-panel">
      <div className="floating-panel-header">
        <h2 className="floating-panel-title">{title}</h2>
        <button className="floating-panel-close" onClick={onClose} aria-label="Close panel">
          &times;
        </button>
      </div>
      <div className="floating-panel-body">
        {children}
      </div>
      {footer && (
        <div className="floating-panel-footer">
          {footer}
        </div>
      )}
    </div>
  )
}
