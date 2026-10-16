import { femaleBack } from "./femaleBack";
import { femaleFront } from "./femaleFront";
import { maleBack } from "./maleBack";
import { maleFront } from "./maleFront";
import type { BodySex, BodySide, BodyView } from "./types";

/*
 * Body-map artwork: SVG path data from react-native-body-highlighter (MIT, (c) 2022 ELABBASSI Hicham),
 * https://github.com/HichamELBSI/react-native-body-highlighter. Converted to typed data and drawn with a
 * plain <svg> (no react-native-svg). Licence text: THIRD_PARTY_NOTICES.md. The files male/female Front/Back
 * are generated; do not edit the path data by hand.
 */
const VIEWS: Record<BodySex, Record<BodySide, BodyView>> = {
  male: { front: maleFront, back: maleBack },
  female: { front: femaleFront, back: femaleBack },
};

export function getBodyView(sex: BodySex, side: BodySide): BodyView {
  return VIEWS[sex][side];
}

/**
 * Pieces of the artwork that are body but not a trainable muscle. Drawn in a quiet neutral, never tinted.
 * (The female back view has hair but no separate head shape: the hair shape covers the head from behind.)
 */
export const CONTEXT_SLUGS: ReadonlySet<string> = new Set(["head", "hair", "neck", "hands", "feet", "ankles", "knees"]);

export type { BodySex, BodySide, BodyView };
