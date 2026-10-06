import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

const blueMark = require('@/assets/images/posa-mark.png');
const lightMark = require('@/assets/images/posa-mark-light.png');

export function PosaMark({ size = 24, onDark = true, style }: {
  size?: number;
  onDark?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image
    source={onDark ? lightMark : blueMark}
    contentFit="contain"
    accessibilityRole="image"
    accessibilityLabel="POSA logo"
    style={[{ width: size, height: size }, style]}
  />;
}

export const POSA_MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1002 1033" fill="none"><g transform="translate(0 1033) rotate(-90)"><defs><linearGradient id="posa-mark-gradient" x1="60" y1="500" x2="970" y2="500" gradientUnits="userSpaceOnUse"><stop stop-color="#3979ea"/><stop offset="1" stop-color="#173f8a"/></linearGradient></defs><path fill="url(#posa-mark-gradient)" d="M189 899C84 806 38 680 39 552 40 313 218 102 449 78c243-25 441 106 518 338-49-108-122-190-222-236-195-89-408-49-551 119C62 454 53 681 189 899Z"/><path fill="url(#posa-mark-gradient)" fill-rule="evenodd" d="M278 422h501v176c0 98-79 177-176 177s-175-79-175-177V475H278v-53Zm171 53v123c0 86 66 145 154 145s155-59 155-145V475H449Z" clip-rule="evenodd"/></g></svg>';
