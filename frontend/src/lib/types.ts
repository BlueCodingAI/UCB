// Wire shapes mirroring the backend DTOs (see docs/BUILD_SPEC.md §10).

export type Locale = 'en' | 'hi' | 'mr';
export type PlanCode = 'freemium' | 'premium' | 'super_premium';

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta?: { pagination?: Pagination };
}
export interface ApiErr {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[];
    requestId: string;
    requiredPlan?: string;
    retryAfterSec?: number;
  };
}
export interface Pagination {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  limit?: number;
}

export interface User {
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
  notifyInApp?: boolean;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
  notifySms?: boolean;
  createdAt: number;
}

export interface PlanFeatures {
  profileMemory: boolean;
  nextSteps: boolean;
  counsellingAssist: boolean;
  oneToOne: boolean;
  inPerson: boolean;
  voice: boolean;
}
export interface Plan {
  code: PlanCode;
  name: string;
  description: string | null;
  pricePaise: number;
  currency: string;
  validityDays: number;
  cutoffDate: number | null;
  features: PlanFeatures;
  dailyChatLimit: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Citation {
  documentId: string;
  chunkId: string;
  title: string;
  sourceLocator: string | null;
  score: number;
}
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  language: Locale;
  inputMode: 'text' | 'voice';
  isGrounded: boolean;
  isFallback: boolean;
  citations: Citation[];
  createdAt: number;
}
export interface ChatSession {
  id: string;
  title: string | null;
  language: Locale;
  channel: 'chat' | 'voice';
  messageCount: number;
  lastMessageAt: number | null;
  createdAt: number;
}

export type CapStage =
  | 'registration'
  | 'document_verification'
  | 'merit_list'
  | 'option_form'
  | 'allotment'
  | 'reporting'
  | 'admission_confirmed';

export interface Recommendation {
  id: string;
  stepType: string;
  title: string;
  description: string | null;
  language: Locale;
  priority: number;
  dueAt: number | null;
  status: 'pending' | 'in_progress' | 'done' | 'dismissed' | 'expired';
  sourceDocumentId: string | null;
}

export interface CounsellingRequest {
  id: string;
  type: 'assist' | 'one_to_one' | 'in_person' | 'general_query';
  topic: string | null;
  message: string | null;
  preferredLanguage: Locale;
  preferredMode: string | null;
  status: string;
  priority: string;
  createdAt: number;
}
export interface CounsellingAppointment {
  id: string;
  requestId: string | null;
  mode: string;
  scheduledStart: number;
  scheduledEnd: number | null;
  location: string | null;
  meetingLink: string | null;
  status: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  language: Locale;
  channel: string;
  actionUrl: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface Banner {
  id: string;
  name: string;
  imageUrl: string;
  imageAlt: string | null;
  targetUrl: string | null;
  placement: string;
}

export interface KbDocument {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  course: string | null;
  capYear: number | null;
  language: string;
  topic: string | null;
  isActive: boolean;
  indexStatus: string;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MetaConfig {
  plans: Plan[];
  languages: Locale[];
  featureFlags: { voiceEnabled: boolean; paymentsEnabled: boolean; aiEnabled: boolean };
  seasonMode: boolean;
  fallbackStrings: { kbMiss: string };
  razorpayKeyId: string | null;
  officialSourceUrl: string;
  currentCapYear: number;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
