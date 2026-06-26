import type { AccessClaims, PlanCode } from '../lib/jwt';

export type { PlanCode, AccessClaims } from '../lib/jwt';
export type Locale = 'en' | 'hi' | 'mr';
export type ChunkLanguage = Locale | 'mixed';

export const LOCALES: Locale[] = ['en', 'hi', 'mr'];
export const PLAN_CODES: PlanCode[] = ['freemium', 'premium', 'super_premium'];

export const CAP_STAGES = [
  'registration',
  'document_verification',
  'merit_list',
  'option_form',
  'allotment',
  'reporting',
  'admission_confirmed',
] as const;
export type CapStage = (typeof CAP_STAGES)[number];

/** Authenticated context attached to req by the auth middleware. */
export interface AuthContext extends AccessClaims {}

// ---- DTOs (camelCase wire shapes; mirrored in frontend/src/lib/types.ts) ----

export interface UserDTO {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  preferredLanguage: Locale;
  locationCity: string | null;
  locationDistrict: string | null;
  currentPlanCode: PlanCode;
  planValidUntil: number | null;
  status: 'active' | 'suspended' | 'deleted';
  emailVerified: boolean;
  mobileVerified: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  notifySms: boolean;
  createdAt: number;
}

export interface PlanDTO {
  code: PlanCode;
  name: string;
  description: string | null;
  pricePaise: number;
  currency: string;
  validityDays: number;
  cutoffDate: number | null;
  features: {
    profileMemory: boolean;
    nextSteps: boolean;
    counsellingAssist: boolean;
    oneToOne: boolean;
    inPerson: boolean;
    voice: boolean;
  };
  dailyChatLimit: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CitationDTO {
  documentId: string;
  chunkId: string;
  title: string;
  sourceLocator: string | null;
  score: number;
}

export interface ChatMessageDTO {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  language: Locale;
  inputMode: 'text' | 'voice';
  isGrounded: boolean;
  isFallback: boolean;
  citations: CitationDTO[];
  createdAt: number;
}

export interface ChatSessionDTO {
  id: string;
  title: string | null;
  language: Locale;
  channel: 'chat' | 'voice';
  messageCount: number;
  lastMessageAt: number | null;
  createdAt: number;
}

export interface BannerDTO {
  id: string;
  name: string;
  imageUrl: string;
  imageAlt: string | null;
  targetUrl: string | null;
  placement: string;
}
