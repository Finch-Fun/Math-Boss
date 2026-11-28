// Sky, ground and the classroom castle. Pure presentation; the castle's look follows the state it is handed.
import { INK } from './characters';
import type { CastleLook } from '../mode';
import { VIEW } from '../layout';

const O = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const };

export function Backdrop() {
  return (
    <g>
      <rect width={VIEW.width} height={VIEW.height} fill="#8fd2f2" />
      <circle cx={520} cy={64} r={34} fill="#ffe27a" />
      <g className="cloud cloud-a"><ellipse cx={170} cy={70} rx={48} ry={16} fill="#fff" /><ellipse cx={200} cy={58} rx={30} ry={16} fill="#fff" /></g>
      <g className="cloud cloud-b"><ellipse cx={680} cy={104} rx={56} ry={17} fill="#fff" /><ellipse cx={650} cy={92} rx={30} ry={15} fill="#fff" /></g>
      <ellipse cx={330} cy={VIEW.groundY + 6} rx={360} ry={70} fill="#a8dca3" />
      <ellipse cx={780} cy={VIEW.groundY + 10} rx={300} ry={58} fill="#97d391" />
      <rect y={VIEW.groundY} width={VIEW.width} height={VIEW.height - VIEW.groundY} fill="#6fbf4a" />
      <path d={`M210 ${VIEW.height} L318 ${VIEW.groundY} L720 ${VIEW.groundY} L810 ${VIEW.height} Z`} fill="#dcbf86" />
      <rect y={VIEW.groundY} width={VIEW.width} height={5} fill="#58a63a" />
      <rect y={VIEW.height - 22} width={VIEW.width} height={22} fill="#5fae3f" />
    </g>
  );
}

export function Castle({ look, flag }: { look: CastleLook; flag: string }) {
  const y = VIEW.groundY;
  return (
    <g className="castle" data-look={look} {...O}>
      <rect x={800} y={206} width={170} height={16} fill="#a49f93" />
      {[806, 830, 854, 878, 902, 926, 950].map((x) => <rect key={x} x={x} y={196} width={13} height={12} fill="#a49f93" />)}
      <rect x={772} y={172} width={50} height={y - 172} fill="#c4bfb2" />
      {[774, 790, 806].map((x) => <rect key={x} x={x} y={162} width={11} height={12} fill="#c4bfb2" />)}
      <rect x={940} y={156} width={56} height={y - 156} fill="#c4bfb2" />
      {[942, 960, 978].map((x) => <rect key={x} x={x} y={146} width={11} height={12} fill="#c4bfb2" />)}
      <rect x={800} y={218} width={170} height={y - 218} fill="#d3cec1" />
      <path d="M822 262 h130 M822 292 h130 M850 218 v44 M912 262 v30 M870 292 v60" fill="none" strokeWidth={1.6} opacity={0.35} />
      <path d="M858 352 L858 306 Q882 280 906 306 L906 352 Z" fill="#5a3a22" />
      <path d="M882 294 L882 352" fill="none" strokeWidth={2} />
      <rect x={781} y={200} width={9} height={22} rx={4} fill="#5a3a22" />
      <rect x={966} y={186} width={9} height={22} rx={4} fill="#5a3a22" />
      <line x1={968} y1={146} x2={968} y2={108} />
      <path className="flag" d={look === 'breached' ? 'M968 128 L1000 138 L968 146 Z' : 'M968 110 L1000 120 L968 132 Z'} fill={flag} />
      {look !== 'ok' && <path className="cracks" d="M850 226 l12 22 l-10 14 l14 22 M930 232 l-8 24 l12 12 l-6 26" fill="none" strokeWidth={2.6} />}
      {look === 'breached' && (
        <g className="breach">
          <path d="M804 262 L840 248 L852 290 L820 352 L804 352 Z" fill="#3b3226" />
          <circle cx={826} cy={y - 4} r={8} fill="#a49f93" /><circle cx={845} cy={y - 2} r={6} fill="#c4bfb2" /><circle cx={812} cy={y - 2} r={5} fill="#c4bfb2" />
          <circle className="smoke s1" cx={828} cy={240} r={9} fill="#e9ecef" stroke="none" />
          <circle className="smoke s2" cx={838} cy={240} r={7} fill="#dee2e6" stroke="none" />
        </g>
      )}
    </g>
  );
}
