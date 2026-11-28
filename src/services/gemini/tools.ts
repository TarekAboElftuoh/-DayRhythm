import { GEMINI_CORE_TOOLS } from './toolsCore';
import { GEMINI_SETTINGS_TOOLS } from './toolsSettings';

export const GEMINI_CHAT_TOOLS = [
  {
    functionDeclarations: [...GEMINI_CORE_TOOLS, ...GEMINI_SETTINGS_TOOLS],
  },
];
