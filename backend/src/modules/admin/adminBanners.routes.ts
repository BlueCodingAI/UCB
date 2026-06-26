import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { imageUpload } from '../../middleware/upload';
import {
  createBannerBody,
  updateBannerBody,
  toggleActiveBody,
  bannerIdParams,
  listBannersQuery,
} from './adminBanners.schema';
import {
  createBanner,
  listBanners,
  updateBannerCtrl,
  toggleBannerActive,
  deleteBannerCtrl,
  bannerAnalytics,
} from './adminBanners.controller';

const router = Router();

// All banner admin routes require an admin.
router.use(requireRole('admin'));

router.post('/', imageUpload.single('image'), validate({ body: createBannerBody }), createBanner);
router.get('/', validate({ query: listBannersQuery }), listBanners);
router.put(
  '/:id',
  imageUpload.single('image'),
  validate({ params: bannerIdParams, body: updateBannerBody }),
  updateBannerCtrl,
);
router.patch('/:id/active', validate({ params: bannerIdParams, body: toggleActiveBody }), toggleBannerActive);
router.delete('/:id', validate({ params: bannerIdParams }), deleteBannerCtrl);
router.get('/:id/analytics', validate({ params: bannerIdParams }), bannerAnalytics);

export default router;
