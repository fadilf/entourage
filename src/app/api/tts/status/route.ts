import { route } from "@/lib/api-route";
import { isPiperInstalled, listInstalledVoices, getAvailableVoices, DEFAULT_VOICE_ID } from "@/lib/piper-installer";

export const GET = route(async () => {
  const [binaryInstalled, installedVoices] = await Promise.all([
    isPiperInstalled(),
    listInstalledVoices(),
  ]);
  return {
    binaryInstalled,
    installedVoices,
    availableVoices: getAvailableVoices(),
    defaultVoice: DEFAULT_VOICE_ID,
  };
});
