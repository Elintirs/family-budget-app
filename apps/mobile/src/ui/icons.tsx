import Svg, { Circle, Path } from 'react-native-svg';

type P = { color: string; size?: number; width?: number };

const base = (size = 24, color: string, width = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const HomeIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
export const InboxIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M3 13h5l2 3h4l2-3h5" />
    <Path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
  </Svg>
);
export const PlusCircleIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 8v8M8 12h8" />
  </Svg>
);
export const ChartIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);
export const SlidersIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <Circle cx="16" cy="6" r="2" />
    <Circle cx="10" cy="12" r="2" />
    <Circle cx="18" cy="18" r="2" />
  </Svg>
);
export const SyncIcon = ({ color, size, width = 2.2 }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M21 12a9 9 0 0 1-15.5 6.2" />
    <Path d="M3 12A9 9 0 0 1 18.5 5.8" />
    <Path d="M18 2v4h-4" />
    <Path d="M6 22v-4h4" />
  </Svg>
);
export const ClockIcon = ({ color, size = 14, width = 2.4 }: P) => (
  <Svg {...base(size, color, width)}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </Svg>
);
export const CheckIcon = ({ color, size = 18, width = 2.6 }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="m5 12 5 5 9-10" />
  </Svg>
);
export const ChevronRightIcon = ({ color, size = 18, width = 2.4 }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="m9 5 7 7-7 7" />
  </Svg>
);
export const ChevronLeftIcon = ({ color, size = 20, width = 2.4 }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="m15 5-7 7 7 7" />
  </Svg>
);
export const ArrowDownIcon = ({ color, size = 22, width = 2.4 }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const BellIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <Path d="M10 21h4" />
  </Svg>
);
export const ListIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M4 6h16M4 12h10M4 18h6" />
  </Svg>
);
export const GaugeIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M4 17a8 8 0 1 1 16 0" />
    <Path d="M12 17l4-5" />
  </Svg>
);
export const RepeatIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M17 2l3 3-3 3" />
    <Path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <Path d="M7 22l-3-3 3-3" />
    <Path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
);
export const PhoneIcon = ({ color, size, width }: P) => (
  <Svg {...base(size, color, width)}>
    <Path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <Path d="M11 18h2" />
  </Svg>
);
