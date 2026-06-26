import type { Locale, CapStage } from './types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';
export const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '';
export const OFFICIAL_SOURCE_URL = 'https://cetcell.mahacet.org';
export const APP_NAME = 'Disha';

export const LOCALES: Locale[] = ['en', 'hi', 'mr'];
export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', hi: 'हिं', mr: 'मरा' };
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

/** Ordered CAP journey stages (the signature "journey rail"). */
export const CAP_STAGES: { key: CapStage; en: string; hi: string; mr: string }[] = [
  { key: 'registration', en: 'Registration', hi: 'पंजीकरण', mr: 'नोंदणी' },
  { key: 'document_verification', en: 'Document Verification', hi: 'दस्तावेज़ सत्यापन', mr: 'कागदपत्र पडताळणी' },
  { key: 'merit_list', en: 'Merit List', hi: 'मेरिट सूची', mr: 'गुणवत्ता यादी' },
  { key: 'option_form', en: 'Option Form', hi: 'विकल्प फॉर्म', mr: 'पर्याय अर्ज' },
  { key: 'allotment', en: 'Allotment', hi: 'आवंटन', mr: 'वाटप' },
  { key: 'reporting', en: 'Reporting', hi: 'रिपोर्टिंग', mr: 'रिपोर्टिंग' },
];

export const PLAN_ORDER = ['freemium', 'premium', 'super_premium'] as const;
