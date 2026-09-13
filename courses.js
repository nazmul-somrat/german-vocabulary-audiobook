const GVA_GATEWAY_ROOT = String(
  (window.GVA_PUBLIC_CONFIG && window.GVA_PUBLIC_CONFIG.audioGateway) || ""
).trim();

const GVA_AUDIO_GATEWAY = GVA_GATEWAY_ROOT &&
  !GVA_GATEWAY_ROOT.includes("PASTE_YOUR_WORKER_URL_HERE")
    ? GVA_GATEWAY_ROOT.replace(/\/+$/, "") + "/"
    : "";

window.GVA_COURSES = [
  {
    id: "a1",
    short: "A1",
    title: "A1 Vocabulary Audiobook",
    description: "Practical beginner German for everyday life with synchronized audio, transcript and active recall.",
    status: "ready",
    totalWords: 778,
    episodes: 15,
    dataScript: "courses/a1/data.js",
    audioBase: GVA_AUDIO_GATEWAY ? GVA_AUDIO_GATEWAY + "s/" : ""
  },
  {
    id: "b1",
    short: "B1",
    title: "B1 Vocabulary Audiobook",
    description: "B1 Core plus B1+ Advanced vocabulary with synchronized audio, transcript and active recall.",
    status: "ready",
    totalWords: 4069,
    episodes: 51,
    dataScript: "courses/b1/data.js",
    audioBase: GVA_AUDIO_GATEWAY ? GVA_AUDIO_GATEWAY + "s/" : ""
  },
  {
    id: "technical",
    short: "TECH",
    title: "Technical Vocabulary Audiobook",
    description: "Engineering, software, AI, data science, manufacturing and workplace technical German.",
    status: "ready",
    totalWords: 1824,
    episodes: 23,
    dataScript: "courses/technical/data.js",
    audioBase: GVA_AUDIO_GATEWAY ? GVA_AUDIO_GATEWAY + "s/" : ""
  }
];
