import { Html } from '@react-three/drei'

interface SystemLabelProps {
  readonly name: string
  readonly subtitle?: string
  readonly position: [number, number, number]
  readonly selected?: boolean
}

/**
 * Tooltip-style label floating above a system.
 * Rounded pill with semi-transparent dark background and warm amber text.
 * Optional subtitle shown below in muted text.
 */
export function SystemLabel({ name, subtitle, position, selected }: SystemLabelProps) {
  return (
    <Html
      position={[position[0], position[1] + 2, position[2]]}
      center
      distanceFactor={40}
      style={{ pointerEvents: 'none' }}
    >
      <div className="system-label" data-selected={selected || undefined}>
        <span className="system-label-text">{name}</span>
        {subtitle && (
          <span className="system-label-subtitle">{subtitle}</span>
        )}
      </div>
    </Html>
  )
}
