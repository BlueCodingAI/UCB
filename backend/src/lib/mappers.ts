import type { PlanDTO, UserDTO, Locale, PlanCode } from '../types';

/** DB row → PlanDTO. */
export function mapPlan(r: any): PlanDTO {
  return {
    code: r.code as PlanCode,
    name: r.name,
    description: r.description ?? null,
    pricePaise: r.price_paise,
    currency: r.currency,
    validityDays: r.validity_days,
    cutoffDate: r.cutoff_date ?? null,
    features: {
      profileMemory: !!r.feat_profile_memory,
      nextSteps: !!r.feat_next_steps,
      counsellingAssist: !!r.feat_counselling_assist,
      oneToOne: !!r.feat_one_to_one,
      inPerson: !!r.feat_in_person,
      voice: !!r.feat_voice,
    },
    dailyChatLimit: r.daily_chat_limit ?? null,
    isActive: !!r.is_active,
    sortOrder: r.sort_order,
  };
}

/** DB row → UserDTO (public-safe; never includes password_hash). */
export function mapUser(r: any): UserDTO {
  return {
    id: r.id,
    fullName: r.full_name ?? null,
    email: r.email ?? null,
    mobile: r.mobile ?? null,
    preferredLanguage: (r.preferred_language ?? 'en') as Locale,
    locationCity: r.location_city ?? null,
    locationDistrict: r.location_district ?? null,
    currentPlanCode: (r.current_plan_code ?? 'freemium') as PlanCode,
    planValidUntil: r.plan_valid_until ?? null,
    status: r.status,
    emailVerified: !!r.email_verified,
    mobileVerified: !!r.mobile_verified,
    notifyInApp: !!r.notify_in_app,
    notifyEmail: !!r.notify_email,
    notifyWhatsapp: !!r.notify_whatsapp,
    notifySms: !!r.notify_sms,
    createdAt: r.created_at,
  };
}
