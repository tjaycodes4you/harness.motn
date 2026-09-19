import { createUniqueId, type ComponentProps } from "solid-js"

// "motn" wordmark. Glyphs m/o/t/n are drawn on the same geometric grid as the
// upstream opencode wordmark (74-wide cells, 92 cap height, 18.46 stroke) so the
// fade + opacity treatment is unchanged; only the letterforms differ.
export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 350 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <path
              opacity="0.7"
              d="M73.8462 110.143H0V18H73.8462V110.143ZM27.6923 36.4286H18.4615V110.143H27.6923V36.4286ZM55.3846 36.4286H46.1538V110.143H55.3846V36.4286Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M147.3846 36.4286H110.4615V91.7143H147.3846V36.4286ZM165.8462 110.143H92V18H165.8462V110.143Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M211.6923 0H230.1538V110.1429H211.6923V0ZM184 18H257.8462V36.4286H184V18Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              d="M331.385 36.4286H294.462V110.143H276V18H331.385V36.4286ZM349.846 110.143H331.385V36.4286H349.846V110.143Z"
              fill="currentColor"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="350" height="129">
          <rect width="350" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="175" y1="68" x2="175" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
