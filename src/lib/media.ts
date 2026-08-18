// A locally-picked photo or video attachment. `uri` is a device-local URI
// for now (image-picker output / object URL on web) — swapping in real
// media hosting later only means changing what populates `uri`, not this
// shape or anywhere it's threaded through (Post, WorkoutLog).
export type MediaAttachment = {
  uri: string;
  type: 'image' | 'video';
};
