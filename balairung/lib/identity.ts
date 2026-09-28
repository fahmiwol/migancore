// Identity — the agent's self. Brand default is "MiganPro" but the user NAMES the
// agent at onboarding; it then recognizes itself by that name. Voice + face are
// chosen ONCE at onboarding and LOCKED after going live (change only via admin).
export const DEFAULT_NAME = "MiganPro";

const get = (k: string) => (typeof window === "undefined" ? null : localStorage.getItem(k));
const set = (k: string, v: string) => { if (typeof window !== "undefined") localStorage.setItem(k, v); };

export const agentName = () => get("migan_agent_name") || DEFAULT_NAME;
export const setAgentName = (n: string) => set("migan_agent_name", n.trim() || DEFAULT_NAME);

export const agentVoice = () => get("migan_voice") || "";
export const setAgentVoice = (n: string) => set("migan_voice", n);

export const agentFace = () => get("migan_face") || ""; // dataURL of chosen photo
export const setAgentFace = (d: string) => set("migan_face", d);

// Lock: after onboarding, voice + face are immutable (admin-only to change).
export const isLocked = () => get("migan_locked") === "1";
export const lockIdentity = () => set("migan_locked", "1");
export const adminUnlock = () => { if (typeof window !== "undefined") localStorage.removeItem("migan_locked"); };

export const isOnboarded = () => get("migan_onboarded") === "1";
export const completeOnboarding = () => set("migan_onboarded", "1");
