import React from 'react';
import { Image } from 'react-native';

type Props = {
  width?: number;
};

const SOURCE = require('../../../assets/brand/horizontal-lockup.png');
const ASPECT_RATIO = 2080 / 784;

// Kettlebell-wave mark + divider + "DOC'S FITNESS NJ" wordmark — black line
// art on a transparent background, so it sits cleanly on any light surface.
export function DocsHorizontalLockup({ width = 140 }: Props) {
  return <Image source={SOURCE} resizeMode="contain" style={{ width, height: width / ASPECT_RATIO }} />;
}
