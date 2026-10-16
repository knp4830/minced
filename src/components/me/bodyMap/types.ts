/** One drawn body (one sex, one side). Paths are SVG `d` strings in the view's own coordinate space. */
export type BodyPart = {
  slug: string;
  left?: string[];
  right?: string[];
  common?: string[];
};

export type BodyView = {
  viewBox: string;
  /** Outer silhouette, drawn as a thin line. */
  outline: string;
  parts: BodyPart[];
};

export type BodySex = "male" | "female";
export type BodySide = "front" | "back";
