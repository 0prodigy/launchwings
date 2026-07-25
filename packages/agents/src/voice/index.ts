// Public surface of the voice subpackage.
export {
  loadVoiceCorpus,
  parseVoiceFile,
  resolveCorpusDir,
  type VoiceSample,
  type LoadVoiceCorpusOpts,
  type SocialChannelLiteral,
} from "./corpus";
export {
  buildSocialDraftSystemPrompt,
  CHANNEL_LIMITS,
  FORBIDDEN_PHRASES,
  type BuildSystemPromptInput,
} from "./system-prompt";
