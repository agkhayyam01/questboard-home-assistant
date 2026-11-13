type Profile = { name: string; species: string; color: string }
type CreatureAction =
  | 'idle' | 'walking' | 'running' | 'hopping' | 'happy' | 'sitting'
  | 'sleeping' | 'curious' | 'confused' | 'yawning' | 'excited' | 'wake' | 'waving'
  | 'celebrating' | 'sniffing' | 'eating' | 'chewing' | 'swallowing' | 'admiring' | 'playing' | 'hugging'

export default function Creature({ profile, small = false, action = 'idle', inBed = false, huggingEmoji }: {
  profile: Profile
  small?: boolean
  action?: CreatureAction
  inBed?: boolean
  huggingEmoji?: string | null
}) {
  const species = profile.species.toLowerCase()
  const elephant = species.includes('elephant')
  const bunny = species.includes('bunny') || species.includes('rabbit')
  const hippo = !elephant && !bunny
  const gigi = bunny && profile.name.toLowerCase() === 'gigi'
  const color = profile.color || (elephant ? '#aab4ca' : bunny ? '#e5c4ba' : '#bfa5c9')
  const outline = elephant ? '#65758b' : bunny ? '#966e70' : '#76647e'
  const closedEyes = action === 'sleeping' || action === 'sitting'
  const mouthOpen = action === 'eating' || action === 'chewing' || action === 'swallowing' || action === 'excited' || action === 'celebrating' || action === 'yawning'

  return <svg
    className={`creature creature-species-${elephant ? 'elephant' : bunny ? 'bunny' : 'hippo'} ${small ? 'creature-small' : ''} ${inBed ? 'creature-in-bed' : ''}`}
    data-pose={inBed ? 'reclined' : undefined}
    data-action={action}
    viewBox="0 0 220 230"
    role="img"
    aria-label={`${profile.name}, the ${profile.species}`}
  >
    <ellipse cx={inBed ? 122 : 110} cy={inBed ? 211 : 216} rx={inBed ? 94 : hippo ? 72 : 68} ry="8" fill="#604c55" opacity=".14" />
    {inBed && <g className="creature-bed-pillow">
      <ellipse cx="77" cy="103" rx="49" ry="31" fill="#fff5eb" stroke="#d7c0b4" strokeWidth="3" />
      <path d="M37 103q40-18 80 0" fill="none" stroke="#ead7c8" strokeWidth="3" strokeLinecap="round" />
    </g>}
    <g className="creature-bed-head" transform={inBed ? 'translate(-35 -12)' : undefined}>
    {bunny && <g className="creature-ears">
      <path d="M75 91C52 66 54 7 76 8c24-1 26 58 17 83" fill={color} stroke={outline} strokeWidth="3" />
      <path d="M72 71C63 50 66 18 76 17c12 1 17 35 12 57" fill="#eaaeb1" />
      <path d="M145 90c19-25 17-78-5-80-24-1-26 57-17 83" fill={color} stroke={outline} strokeWidth="3" />
      <path d="M147 69c9-21 6-51-4-52-12 1-17 35-12 57" fill="#eaaeb1" />
    </g>}
    {elephant && <g className="creature-ears">
      <ellipse cx="48" cy="106" rx="39" ry="48" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="48" cy="106" rx="25" ry="33" fill="#edb8b8" opacity=".83" />
      <ellipse cx="172" cy="106" rx="39" ry="48" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="172" cy="106" rx="25" ry="33" fill="#edb8b8" opacity=".83" />
    </g>}
    {hippo && <g className="creature-ears">
      <ellipse cx="60" cy="57" rx="14" ry="16" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="60" cy="57" rx="6" ry="8" fill="#e8b3c9" />
      <ellipse cx="160" cy="57" rx="14" ry="16" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="160" cy="57" rx="6" ry="8" fill="#e8b3c9" />
    </g>}
    </g>
    <g className="creature-bed-body" transform={inBed ? 'translate(20 -7) translate(110 169) scale(1.15 .85) translate(-110 -169)' : undefined}>
    {elephant && <g className="creature-tail">
      <path d="M160 169q18 5 20 22" fill="none" stroke={outline} strokeWidth="6" strokeLinecap="round" />
      <path d="m177 187 8 2-7 7-6-4Z" fill={outline} />
    </g>}
    {bunny && <circle className="creature-tail" cx="169" cy="177" r="13" fill="#fff1e9" stroke={outline} strokeWidth="3" />}
    {hippo && <path className="creature-tail" d="M164 178q15 4 14 17" fill="none" stroke={outline} strokeWidth="7" strokeLinecap="round" />}
    {hippo ? <g className="creature-legs" fill={color} stroke={outline} strokeWidth="3">
      <path className="creature-foot creature-foot-left" d="M58 175h38v31q0 12-12 12H70q-12 0-12-12v-25Z" />
      <path className="creature-foot creature-foot-right" d="M124 175h38v31q0 12-12 12h-14q-12 0-12-12Z" />
    </g> : <g className="creature-legs" fill={color} stroke={outline} strokeWidth="3">
      <path className="creature-foot creature-foot-left" d="M65 177h39v29q0 12-12 12H73q-12 0-12-12v-19q0-10 4-10Z" />
      <path className="creature-foot creature-foot-right" d="M116 177h39q4 9 4 19v10q0 12-12 12h-19q-12 0-12-12v-29Z" />
    </g>}
    {hippo ? <>
      <path d="M52 150Q36 173 51 193q17 25 59 25t59-25q15-20-1-43-23-20-58-20t-58 20Z" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="110" cy="184" rx="38" ry="25" fill="#fff1e9" opacity=".43" />
    </> : <>
      <ellipse cx="110" cy="169" rx="61" ry="43" fill={color} stroke={outline} strokeWidth="3" />
      <ellipse cx="110" cy="177" rx="37" ry="26" fill="#fff1e9" opacity=".43" />
    </>}
    </g>
    <g className="creature-head" transform={inBed ? 'translate(-35 -12)' : undefined}>
    <ellipse cx="110" cy="105" rx={elephant ? 65 : 67} ry="62" fill={color} stroke={outline} strokeWidth="3" />
    {gigi && <g className="creature-bow" stroke="#985e71" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M109 51Q92 34 85 47q-3 11 22 12m4-8q18-17 25-4 3 11-24 12Z" fill="#dc91a2" />
      <circle cx="110" cy="54" r="5" fill="#f3ce8f" />
    </g>}
    {hippo && <g className="creature-muzzle">
      <ellipse cx="110" cy="139" rx="59" ry="38" fill="#d2b6e0" stroke={outline} strokeWidth="3" />
      <ellipse className="creature-nostril" cx="87" cy="126" rx="7" ry="5" fill="#775f7f" />
      <ellipse className="creature-nostril" cx="133" cy="126" rx="7" ry="5" fill="#775f7f" />
    </g>}
    {!hippo && <ellipse cx="110" cy="126" rx={bunny ? 43 : 48} ry={bunny ? 26 : 30} fill="#fff1e9" opacity=".82" />}
    {closedEyes
      ? <g fill="none" stroke={outline} strokeWidth="4" strokeLinecap="round"><path d="M62 99q10 10 20 0" /><path d="M138 99q10 10 20 0" />{gigi && <g className="creature-lashes" strokeWidth="2"><path d="m63 99-4 3m9 1-3 4m68-8 4 3m-9 1 3 4" /></g>}</g>
      : <g className="creature-eyes">
        <ellipse cx={hippo ? 70 : 82} cy="98" rx="10" ry={action === 'curious' ? 14 : 12} fill="#fff" />
        <ellipse cx={hippo ? 150 : 138} cy="98" rx="10" ry={action === 'curious' ? 14 : 12} fill="#fff" />
        <ellipse cx={hippo ? 71 : 83} cy="100" rx="5" ry="7" fill="#493e46" />
        <ellipse cx={hippo ? 151 : 139} cy="100" rx="5" ry="7" fill="#493e46" />
        <circle cx={hippo ? 73 : 85} cy="97" r="2" fill="#fff" />
        <circle cx={hippo ? 153 : 141} cy="97" r="2" fill="#fff" />
        <path d={action === 'curious' ? 'M58 81q12-9 24-2m54 0q12-7 24 2' : 'M62 84q10-6 19-2m58 0q10-4 19 2'} fill="none" stroke={outline} strokeWidth="3" strokeLinecap="round" />
        {gigi && <g className="creature-lashes" fill="none" stroke={outline} strokeWidth="2" strokeLinecap="round"><path d="m67 89-3-5m9 4-1-6m8 7 1-5m63 5 1-5m8 4 3-6m4 8 4-5" /></g>}
      </g>}
    <g className="creature-cheeks">
      <ellipse cx="57" cy="126" rx={hippo ? 11 : 10} ry="7" fill="#e98c99" opacity={gigi ? '.78' : '.6'} />
      <ellipse cx="163" cy="126" rx={hippo ? 11 : 10} ry="7" fill="#e98c99" opacity={gigi ? '.78' : '.6'} />
    </g>
    {hippo ? <>
      <g className="creature-mouth">
      <path d="M76 145q34 25 68 0" fill="none" stroke="#75575c" strokeWidth="3" strokeLinecap="round" />
      {mouthOpen && <g className="creature-open-mouth">
        <path d="M78 145q32 34 64 0-4 29-32 31-28-2-32-31Z" fill="#754e61" />
        <path d="M91 166q19 10 38 0v9q-19 9-38 0Z" fill="#e8878c" />
        <path d="m88 152 6 10m38-10-6 10" stroke="#fff4e8" strokeWidth="5" strokeLinecap="round" />
      </g>}
      </g>
    </> : <>
      {!elephant && <path className="creature-nose" d={bunny ? 'M105 124q5-7 10 0-2 7-5 7t-5-7Z' : 'M101 123q9-8 18 0-1 8-9 8t-9-8Z'} fill="#b9757e" />}
      <g className="creature-mouth">
      <path d={mouthOpen ? 'M100 136q10 18 20 0' : action === 'confused' ? 'M104 141q7-6 13 0' : action === 'curious' ? 'M105 139q5-6 10 0t-5 6-5-6Z' : 'M99 137q11 12 22 0'} fill="none" stroke="#75575c" strokeWidth="2.5" strokeLinecap="round" />
      {mouthOpen && <path d="M101 143q9 7 18 0v5q-9 7-18 0Z" fill="#e8878c" />}
      </g>
    </>}
    {elephant && <g className="creature-trunk">
      <path d="M103 106c-9 13-16 31-9 44 5 11 17 15 28 10 9-4 15-12 14-19-1-6-7-8-11-4-3 3-1 7 2 9-2 6-9 10-14 7-7-4-4-15 0-25 4-9 8-17 12-24Z" fill={color} stroke={outline} strokeWidth="3" strokeLinejoin="round" />
      <path d="M129 144q3-2 6 0" fill="none" stroke="#765f73" strokeWidth="2" strokeLinecap="round" />
    </g>}
    </g>
    {action === 'hugging' && huggingEmoji && <g className="creature-hugged-toy" role="img" aria-label="Stuffed animal being hugged">
      <title>{huggingEmoji} stuffed animal</title>
      <ellipse cx="110" cy="190" rx="31" ry="5" fill="#604c55" opacity=".12" />
      <circle cx="87" cy="150" r="13" fill="#b8794f" stroke="#714b38" strokeWidth="3" />
      <circle cx="133" cy="150" r="13" fill="#b8794f" stroke="#714b38" strokeWidth="3" />
      <ellipse cx="110" cy="178" rx="23" ry="25" fill="#c98d5d" stroke="#714b38" strokeWidth="3" />
      <ellipse cx="91" cy="184" rx="11" ry="9" fill="#c98d5d" stroke="#714b38" strokeWidth="2.5" />
      <ellipse cx="129" cy="184" rx="11" ry="9" fill="#c98d5d" stroke="#714b38" strokeWidth="2.5" />
      <ellipse cx="97" cy="198" rx="13" ry="9" fill="#c98d5d" stroke="#714b38" strokeWidth="2.5" />
      <ellipse cx="123" cy="198" rx="13" ry="9" fill="#c98d5d" stroke="#714b38" strokeWidth="2.5" />
      <circle cx="110" cy="158" r="22" fill="#d9a06c" stroke="#714b38" strokeWidth="3" />
      <circle cx="102" cy="155" r="2.5" fill="#493e46" />
      <circle cx="118" cy="155" r="2.5" fill="#493e46" />
      <ellipse cx="110" cy="164" rx="8" ry="6" fill="#f3d9bd" />
      <path d="m107 162 3-3 3 3-3 3Z" fill="#714b38" />
    </g>}
    <g className="creature-arms">
      {action === 'hugging'
        ? <>
          <path className="creature-hug-arm" d="M75 160C60 175 71 195 91 190l8-10" fill="none" stroke={outline} strokeWidth={hippo ? 12 : 10} strokeLinecap="round" />
          <path className="creature-hug-arm" d="M145 160c15 15 4 35-16 30l-8-10" fill="none" stroke={outline} strokeWidth={hippo ? 12 : 10} strokeLinecap="round" />
        </>
        : inBed
          ? <path d="M75 164q-8 10 5 18m65-18q8 10-5 18" fill="none" stroke={outline} strokeWidth={hippo ? 11 : 9} strokeLinecap="round" />
          : <path d="M75 164q-13-8-19 2m89-2q13-8 19 2" fill="none" stroke={outline} strokeWidth={hippo ? 11 : 9} strokeLinecap="round" />}
    </g>
    {inBed && <g className="creature-bedding">
      <path d="M73 160q61-20 133-3l8 45q-70 24-140 0Z" fill="#79b8d5" stroke="#527c99" strokeWidth="4" strokeLinejoin="round" />
      <path d="M73 160q61-20 133-3l-2 11q-60-17-129 3Z" fill="#c6e7ed" />
      <path d="M86 173q15-8 30-8v28q-15 2-28 9Zm47-14q15-2 29 1v30q-15-2-29-1Zm48 4 17 2 3 19-20-3Z" fill="#a5d2e0" stroke="#6b9db6" strokeWidth="2" />
      <path d="M77 193q66 17 132-1" fill="none" stroke="#e7f3ed" strokeWidth="3" strokeLinecap="round" />
    </g>}
    {!inBed && <path d="M90 184q20 13 40 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />}
  </svg>
}
