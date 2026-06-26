import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './migrate';
import { db, closeDb } from './connection';
import { env } from '../config/env';
import { newId } from '../lib/ids';
import { now, parseDate } from '../lib/time';
import { hashPassword } from '../lib/crypto';
import { setSetting, FALLBACK_DEFAULTS } from '../services/settings';
import { embedBatch } from '../services/openai';
import { encodeEmbedding } from '../services/vectorStore';
import { logger } from '../lib/logger';

function cutoffDate(): number {
  const fromEnv = parseDate(env.admissionCutoffDate);
  if (fromEnv) return fromEnv;
  // Default: 31 Aug of the current CAP year, end of day UTC.
  return Date.UTC(env.currentCapYear, 7, 31, 23, 59, 59);
}

async function seed(): Promise<void> {
  migrate();
  const ts = now();
  const cutoff = cutoffDate();

  // ---- Roles ----
  const roles: Array<[string, string, string[]]> = [
    ['super_admin', 'Super Admin', ['*']],
    ['admin', 'Administrator', ['users.*', 'kb.*', 'plans.*', 'banners.*', 'broadcasts.*', 'counselling.*', 'payments.read']],
    ['kb_manager', 'Knowledge Base Manager', ['kb.*']],
    ['counsellor', 'Counsellor', ['counselling.*', 'users.read']],
    ['support', 'Support', ['users.read', 'notifications.*']],
  ];
  const insRole = db.prepare(
    `INSERT INTO roles (code, name, permissions, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, permissions=excluded.permissions`,
  );
  for (const [code, name, perms] of roles) insRole.run(code, name, JSON.stringify(perms), ts);

  // ---- Plans ----
  const insPlan = db.prepare(
    `INSERT INTO plans (code, name, description, price_paise, currency, validity_days, cutoff_date,
        feat_profile_memory, feat_next_steps, feat_counselling_assist, feat_one_to_one, feat_in_person, feat_voice,
        daily_chat_limit, is_active, sort_order, created_at, updated_at)
     VALUES (@code,@name,@description,@price,'INR',365,@cutoff,@pm,@ns,@ca,@o2o,@ip,@voice,@limit,1,@sort,@ts,@ts)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description,
        price_paise=excluded.price_paise, cutoff_date=excluded.cutoff_date,
        feat_profile_memory=excluded.feat_profile_memory, feat_next_steps=excluded.feat_next_steps,
        feat_counselling_assist=excluded.feat_counselling_assist, feat_one_to_one=excluded.feat_one_to_one,
        feat_in_person=excluded.feat_in_person, feat_voice=excluded.feat_voice,
        daily_chat_limit=excluded.daily_chat_limit, sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
  );
  insPlan.run({ code: 'freemium', name: 'Freemium', description: 'Free general CAP guidance in English, Hindi & Marathi.', price: 0, cutoff, pm: 0, ns: 0, ca: 0, o2o: 0, ip: 0, voice: 1, limit: 20, sort: 0, ts });
  insPlan.run({ code: 'premium', name: 'Premium', description: 'Saved profile memory, personalised next-step guidance & CAP counselling assistance.', price: 9900, cutoff, pm: 1, ns: 1, ca: 1, o2o: 0, ip: 0, voice: 1, limit: 200, sort: 1, ts });
  insPlan.run({ code: 'super_premium', name: 'Super Premium', description: 'Everything in Premium plus one-to-one counselling, direct guidance & in-person support.', price: 49900, cutoff, pm: 1, ns: 1, ca: 1, o2o: 1, ip: 1, voice: 1, limit: null, sort: 2, ts });

  // ---- Bootstrap super admin ----
  const adminExists = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(env.adminBootstrapEmail);
  if (!adminExists) {
    const hash = await hashPassword(env.adminBootstrapPassword);
    db.prepare(
      `INSERT INTO admin_users (id, full_name, email, password_hash, role_code, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'super_admin', 'active', ?, ?)`,
    ).run(newId(), env.adminBootstrapName, env.adminBootstrapEmail, hash, ts, ts);
    logger.info({ email: env.adminBootstrapEmail }, 'bootstrap super admin created');
  }

  // ---- App settings ----
  setSetting('fallback_message_en', FALLBACK_DEFAULTS.en, 'KB-miss fallback (English)');
  setSetting('fallback_message_hi', FALLBACK_DEFAULTS.hi, 'KB-miss fallback (Hindi)');
  setSetting('fallback_message_mr', FALLBACK_DEFAULTS.mr, 'KB-miss fallback (Marathi)');
  setSetting('rag_top_k', env.ragTopK, 'Top-K chunks for retrieval');
  setSetting('rag_min_score', env.ragMinScore, 'Minimum hybrid relevance score');
  setSetting('embedding_model', env.openaiEmbeddingModel, 'Embedding model id');
  setSetting('current_cap_year', env.currentCapYear, 'Active CAP cycle year');
  setSetting('cap_cutoff_date', cutoff, 'Admission cut-off date (epoch ms) capping plan validity');
  setSetting('default_language', 'en', 'Default UI/bot language');

  // ---- KB tags ----
  const insTag = db.prepare(
    `INSERT INTO kb_tags (id, kind, value, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, value) DO NOTHING`,
  );
  for (const [kind, value] of [
    ['course', 'engineering'],
    ['course', 'pharmacy'],
    ['course', 'mba'],
    ['topic', 'registration'],
    ['topic', 'option_form'],
    ['topic', 'merit_list'],
    ['year', String(env.currentCapYear)],
  ] as Array<[string, string]>) {
    insTag.run(newId(), kind, value, ts);
  }

  // ---- Sample indexed KB document (so RAG works on first boot) ----
  const sampleExists = db.prepare("SELECT id FROM kb_documents WHERE title LIKE 'CAP%sample%'").get();
  if (!sampleExists) {
    const docId = newId();
    db.prepare(
      `INSERT INTO kb_documents (id, title, description, source_type, language, course, cap_year, topic,
         is_active, index_status, chunk_count, embedding_model, created_at, updated_at, indexed_at)
       VALUES (?, ?, ?, 'faq', 'en', 'engineering', ?, 'registration', 1, 'indexed', 0, ?, ?, ?, ?)`,
    ).run(
      docId,
      `CAP ${env.currentCapYear} — Frequently Asked Questions (sample)`,
      'Sample admin-uploaded FAQ used to demonstrate KB-grounded answers.',
      env.currentCapYear,
      env.openaiEmbeddingModel,
      ts,
      ts,
      ts,
    );

    const chunks = [
      {
        content: `CAP registration: To take part in the Maharashtra CAP (Centralised Admission Process) for engineering, a candidate must register on the official CET Cell portal, fill the application form, upload required documents, and pay the registration fee. Registration is done once per CAP cycle. The official portal is cetcell.mahacet.org.`,
        locator: 'FAQ #1 · Registration',
      },
      {
        content: `Option form (preference filling): After the provisional merit list is published, eligible candidates fill the online option form by listing their preferred colleges and courses in priority order. Allotment in each CAP round is based on merit, category and the preferences submitted in the option form. Lock your choices before the deadline.`,
        locator: 'FAQ #2 · Option form',
      },
    ];

    const embeddings = await embedBatch(chunks.map((c) => c.content));
    const insChunk = db.prepare(
      `INSERT INTO kb_chunks (id, document_id, chunk_index, content, token_count, language, course, cap_year, topic,
         is_active, embedding, embedding_dim, embedding_model, source_locator, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'en', 'engineering', ?, 'registration', 1, ?, ?, ?, ?, '{}', ?)`,
    );
    chunks.forEach((c, i) => {
      const vec = embeddings[i];
      insChunk.run(
        newId(),
        docId,
        i,
        c.content,
        Math.ceil(c.content.length / 4),
        env.currentCapYear,
        encodeEmbedding(vec),
        vec.length,
        env.openaiEmbeddingModel,
        c.locator,
        ts,
      );
    });
    db.prepare('UPDATE kb_documents SET chunk_count = ? WHERE id = ?').run(chunks.length, docId);
    logger.info('sample KB document indexed');
  }

  // ---- Sample banner ----
  const bannerExists = db.prepare('SELECT id FROM banners LIMIT 1').get();
  if (!bannerExists) {
    const uploadsDir = path.join(env.storageDir, 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200" viewBox="0 0 1200 200"><rect width="1200" height="200" fill="#143C46"/><rect x="24" y="24" width="1152" height="152" rx="16" fill="#0E7C6B"/><text x="60" y="110" fill="#EAF1F0" font-family="sans-serif" font-size="34" font-weight="700">Disha — your calm guide through CAP</text><text x="60" y="150" fill="#FBE7C6" font-family="sans-serif" font-size="20">Sponsored placement · sample banner</text></svg>`;
    fs.writeFileSync(path.join(uploadsDir, 'sample-banner.svg'), svg, 'utf8');
    db.prepare(
      `INSERT INTO banners (id, name, image_path, image_alt, target_url, placement, target_language,
         is_active, starts_at, ends_at, priority, created_at, updated_at)
       VALUES (?, 'Sample Welcome Banner', 'sample-banner.svg', 'Disha sample banner', 'https://cetcell.mahacet.org',
         'home_top', 'all', 1, ?, ?, 1, ?, ?)`,
    ).run(newId(), ts, ts + 90 * 24 * 60 * 60 * 1000, ts, ts);
    logger.info('sample banner created');
  }

  logger.info('seed complete');
}

if (require.main === module) {
  seed()
    .then(() => {
      closeDb();
      // eslint-disable-next-line no-console
      console.log('✓ Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('✗ Seed failed:', err);
      process.exit(1);
    });
}
