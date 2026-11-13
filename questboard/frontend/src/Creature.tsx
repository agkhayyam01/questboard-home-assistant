type Profile = { name: string; species: string; color: string }
type CreatureAction = 'idle' | 'walking' | 'running' | 'hopping' | 'happy' | 'sitting' | 'sleeping' | 'curious' | 'excited' | 'wake' | 'waving' | 'celebrating'

export default function Creature({ profile, small = false, action = 'idle' }: {
  profile: Profile
  small?: boolean
  action?: CreatureAction
}) {
  const species = profile.species.toLowerCase()
  const elephant = species.includes('elephant')
  const bunny = species.includes('bunny') || species.includes('rabbit')
  const color = profile.color || (elephant ? '#aab4ca' : bunny ? '#e5c4ba' : '#bfa5c9')
  const outline = elephant ? '#65758b' : bunny ? '#966e70' : '#76647e'
  const closedEyes = action === 'sleeping' || action === 'sitting'

  return <svg
    className={`creature ${small ? 'creature-small' : ''}`}
    data-action={action}
    viewBox="0 0 220 230"
    role="img"
    aria-label={`${profile.name}, the ${profile.species}`}
  >
    <ellipse cx="110" cy="214" rx="70" ry="8" fill="#604c55" opacity=".14" />
    {bunny && <>
      <path d="M75 91C52 66 54 7 76 8c24-1 26 58 17 83" fill={color} stroke={outline} strokeWidth="3" />
      <path d="M72 71C63 50 66 18 76 17c12 1 17 35 12 57" fill="#eaaeb1" />
      <path d="M145 90c19-25 17-78-5-80-24-1-26 57-17 83" fill={color} stroke={outline} strokeWidth="3" />
      <path d="M147 69c9-21 6-51-4-52-12 1-17 35-12 57" fill="#eaaeb1" />
    </>}
    {elephant && <>
      <ellipse cx="48" cy="106" rx="39" ry="48" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="48" cy="106" rx="25" ry="33" fill="#edb8b8" opacity=".83" />
      <ellipse cx="172" cy="106" rx="39" ry="48" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="172" cy="106" rx="25" ry="33" fill="#edb8b8" opacity=".83" />
    </>}
    {!bunny && !elephant && <>
      <ellipse cx="58" cy="76" rx="19" ry="21" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="162" cy="76" rx="19" ry="21" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="58" cy="76" rx="9" ry="10" fill="#edb8b8" />
      <ellipse cx="162" cy="76" rx="9" ry="10" fill="#edb8b8" />
    </>}
    <g className="creature-legs" fill={color} stroke={outline} strokeWidth="3">
      <path className="creature-foot creature-foot-left" d="M65 177h39v29q0 12-12 12H73q-12 0-12-12v-19q0-10 4-10Z" />
      <path className="creature-foot creature-foot-right" d="M116 177h39q4 9 4 19v10q0 12-12 12h-19q-12 0-12-12v-29Z" />
    </g>
    <ellipse cx="110" cy="169" rx="61" ry="43" fill={color} stroke={outline} strokeWidth="3" />
    <ellipse cx="110" cy="177" rx="37" ry="26" fill="#fff1e9" opacity=".43" />
    <path d="M75 164q-13-8-19 2m89-2q13-8 19 2" fill="none" stroke={outline} strokeWidth="9" strokeLinecap="round" />
    <ellipse cx="110" cy="105" rx={elephant ? 65 : 67} ry="62" fill={color} stroke={outline} strokeWidth="3" />
    {elephant && <path d="M104 117c-7 13-8 30 1 39 8 8 20 2 21-7" fill="none" stroke={outline} strokeWidth="22" strokeLinecap="round" />}
    {!elephant && <ellipse cx="110" cy="126" rx={bunny ? 43 : 48} ry={bunny ? 26 : 30} fill="#fff1e9" opacity=".82" />}
    {closedEyes
      ? <g fill="none" stroke={outline} strokeWidth="4" strokeLinecap="round"><path d="M68 106q10 10 20 0" /><path d="M132 106q10 10 20 0" /></g>
      : <g>
        <ellipse cx="82" cy="105" rx="9" ry={action === 'curious' ? 13 : 11} fill="#fff" />
        <ellipse cx="138" cy="105" rx="9" ry={action === 'curious' ? 13 : 11} fill="#fff" />
        <ellipse cx="83" cy="107" rx="5" ry="7" fill="#493e46" />
        <ellipse cx="139" cy="107" rx="5" ry="7" fill="#493e46" />
        <circle cx="85" cy="104" r="2" fill="#fff" /><circle cx="141" cy="104" r="2" fill="#fff" />
        <path d={action === 'curious' ? 'M70 87q12-9 24-2m32 0q12-7 24 2' : 'M72 91q10-6 19-2m38 0q10-4 19 2'} fill="none" stroke={outline} strokeWidth="3" strokeLinecap="round" />
      </g>}
    <ellipse cx="64" cy="128" rx="10" ry="6" fill="#e98c99" opacity=".6" />
    <ellipse cx="156" cy="128" rx="10" ry="6" fill="#e98c99" opacity=".6" />
    {!elephant && <>
      <path d={bunny ? 'M105 124q5-7 10 0-2 7-5 7t-5-7Z' : 'M101 123q9-8 18 0-1 8-9 8t-9-8Z'} fill="#b9757e" />
      <path d={action === 'excited' || action === 'celebrating' ? 'M100 136q10 18 20 0' : action === 'curious' ? 'M105 139q5-6 10 0t-5 6-5-6Z' : 'M99 137q11 12 22 0'} fill="none" stroke="#75575c" strokeWidth="2.5" strokeLinecap="round" />
      {(action === 'excited' || action === 'celebrating') && <path d="M101 143q9 7 18 0v5q-9 7-18 0Z" fill="#e8878c" />}
    </>}
    <path d="M90 184q20 13 40 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
  </svg>
}
