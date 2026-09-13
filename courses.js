const GVA_GATEWAY_ROOT = String(
  (window.GVA_PUBLIC_CONFIG && window.GVA_PUBLIC_CONFIG.audioGateway) || ""
).trim();

const GVA_AUDIO_GATEWAY = GVA_GATEWAY_ROOT &&
  !GVA_GATEWAY_ROOT.includes("PASTE_YOUR_WORKER_URL_HERE")
    ? GVA_GATEWAY_ROOT.replace(/\/+$/, "") + "/"
    : "";

window.GVA_COURSES = [
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
    id: "b2",
    short: "B2",
    title: "B2 Vocabulary Audiobook",
    description: "B2 vocabulary course — ready for your future audio and transcript set.",
    status: "coming",
    totalWords: null,
    episodes: null,
    dataScript: "courses/b2/data.js",
    audioBase: GVA_AUDIO_GATEWAY ? GVA_AUDIO_GATEWAY + "s/" : ""
  },
  {
    id: "technical",
    short: "TECH",
    title: "Technical Vocabulary Audiobook",
    description: "Engineering and technical German vocabulary — course slot prepared.",
    status: "coming",
    totalWords: 1825,
    episodes: null,
    dataScript: "courses/technical/data.js",
    audioBase: GVA_AUDIO_GATEWAY ? GVA_AUDIO_GATEWAY + "s/" : ""
  }
];
