// Icônes d'interface (ART_BIBLE §8.4) : grille de 24 px, trait d'encre de 1,8 px, extrémités rondes.
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6.5v11M15 6.5v11" strokeWidth={2.6} />
  </Svg>
)

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
  </Svg>
)

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3h3.4l.5 2.3 1.9 1.1 2.2-.8 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.2-.8-1.9 1.1-.5 2.3h-3.4l-.5-2.3-1.9-1.1-2.2.8-1.7-2.9 1.8-1.6v-2.2L4 9.5l1.7-2.9 2.2.8 1.9-1.1z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
)

export const IconCrown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z" fill="#FFF2C3" />
    <path d="M5 20.5h14" />
  </Svg>
)

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.2" fill="#FFF2C3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </Svg>
)

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6z" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M4.5 19.5l15-15" strokeWidth={2.2} />
  </Svg>
)

export const IconFeather = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 4.5c-6 0-11 4.5-11.5 11.5l-.5 3.5 3.5-.5c7-.5 9-6.5 8.5-14.5z" />
    <path d="M4 20.5l9.5-10M11 14.5h4.5M13.5 11h3.5" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l4.5 4.5L19.5 6.5" strokeWidth={2.6} />
  </Svg>
)

export const IconDice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" />
  </Svg>
)

export const IconReconnect = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12a7 7 0 1 1-2.05-4.95" />
    <path d="M19.5 4v4h-4" />
  </Svg>
)

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.4} />
  </Svg>
)

export const IconRematch = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h11l-3-3M20 17H9l3 3" />
    <path d="M17 7c2 0 3 1.5 3 3.5M7 17c-2 0-3-1.5-3-3.5" />
  </Svg>
)

export const IconLobby = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 19.5 12 5l8.5 14.5z" />
    <path d="M12 19.5v-5M9.5 19.5 12 14.5l2.5 5" />
  </Svg>
)

export const IconRules = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Svg>
)

export const IconPhoneRotate = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8.5" width="14" height="9" rx="1.8" transform="rotate(-8 10 13)" />
    <path d="M17.5 3.5a5 5 0 0 1 3.5 5M21 8.5l-2.2-.3M21 8.5l.4-2.1" />
  </Svg>
)

export const IconVibrate = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="4" width="8" height="16" rx="1.6" />
    <path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" />
  </Svg>
)

/** Joystick vu de dessus (contrôle Absolu). */
export const IconStick = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="14.5" cy="9.5" r="3" fill="currentColor" />
    <path d="M12 12l1.5-1.5" />
  </Svg>
)

/** Volant (contrôle Relatif). */
export const IconWheel = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M3.8 10.5h6.3M13.9 10.5h6.3M12 14v6.3" />
  </Svg>
)

/** Téléphone incliné (contrôle Inclinaison). */
export const IconTilt = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="7" width="15" height="9" rx="1.6" transform="rotate(-18 12 11.5)" />
    <path d="M3 20.5h18" strokeDasharray="1.5 2.5" />
  </Svg>
)

/** Ailes (COUP D'AILE). */
export const IconWings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 14c-1.5-4-5-6.5-9.5-6.5 1 3.5 3.5 7 9.5 7.5z" fill="currentColor" fillOpacity={0.12} />
    <path d="M12 14c1.5-4 5-6.5 9.5-6.5-1 3.5-3.5 7-9.5 7.5z" fill="currentColor" fillOpacity={0.12} />
    <path d="M6 9.5c1 1.2 2 2 3.5 2.6M18 9.5c-1 1.2-2 2-3.5 2.6" />
    <path d="M12 14v4.5" />
  </Svg>
)

/** Plume qui flotte (reconnexion) : vexille, rachis et quelques barbes. */
export const IconSpinFeather = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18.8 3.2C12.5 3.6 8 8.2 7.4 14.6l-.3 3.2 3.1-.4c6.2-.8 9-6 8.6-14.2z" fill="#F7F0E3" />
    <path d="M4 21 16.5 6.2" />
    <path d="M9.6 14.2 7.6 13M11.6 11.8l-2.4-1.3M13.6 9.5l-2.2-1.4M11.4 15.2l2.6.4M13.6 12.6l2.6.2" strokeWidth={1.2} />
  </Svg>
)
