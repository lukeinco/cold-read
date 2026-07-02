// Ordered segment sequence that drives the entire Cold Read screening flow.
// Audio prompt URLs are intentionally empty for now — they'll be filled in later.

export type SegmentType = "warmup" | "scripted" | "improv";

export interface Segment {
  id: string;
  type: SegmentType;
  promptAudioUrl: string;
  scriptText: string | null;
  countdownSeconds: number | null;
  cueColor: string;
  cueLabel: string;
}

export const segments: Segment[] = [
  {
    id: "warmup-01",
    type: "warmup",
    promptAudioUrl: "",
    scriptText: null,
    countdownSeconds: 30,
    cueColor: "#3D5E4A",
    cueLabel: "Warm up",
  },
  {
    id: "scripted-01",
    type: "scripted",
    promptAudioUrl: "",
    scriptText: "Placeholder scripted line one. Read this exactly as written.",
    countdownSeconds: null,
    cueColor: "#2B2B28",
    cueLabel: "Read aloud",
  },
  {
    id: "scripted-02",
    type: "scripted",
    promptAudioUrl: "",
    scriptText: "Placeholder scripted line two. Read this exactly as written.",
    countdownSeconds: null,
    cueColor: "#2B2B28",
    cueLabel: "Read aloud",
  },
  {
    id: "scripted-03",
    type: "scripted",
    promptAudioUrl: "",
    scriptText: "Placeholder scripted line three. Read this exactly as written.",
    countdownSeconds: null,
    cueColor: "#2B2B28",
    cueLabel: "Read aloud",
  },
  {
    id: "improv-01",
    type: "improv",
    promptAudioUrl: "",
    scriptText: null,
    countdownSeconds: 60,
    cueColor: "#C44A18",
    cueLabel: "Improvise",
  },
];
