// Supported languages for Voice-Flow
// Note: Currently using Parakeet TDT 0.6B which primarily supports English
// Multi-language ASR support depends on model capabilities

export interface Language {
  code: string
  name: string
  nativeName: string
  flag: string
  supported: boolean // Whether the current ASR model supports this language
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', supported: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', supported: false },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', supported: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', supported: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', supported: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', supported: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', supported: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', supported: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', supported: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', supported: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', supported: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', supported: false },
]

export const DEFAULT_LANGUAGE = 'en'

export function getLanguageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code)
}

export function getSupportedLanguages(): Language[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.supported)
}

export function getAllLanguages(): Language[] {
  return SUPPORTED_LANGUAGES
}
