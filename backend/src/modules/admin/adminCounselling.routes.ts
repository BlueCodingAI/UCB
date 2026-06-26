import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  idParams,
  listRequestsQuery,
  updateRequestBody,
  addNoteBody,
  createSlotBody,
  listSlotsQuery,
  listAppointmentsQuery,
} from './adminCounselling.schema';
import {
  listRequests,
  updateRequest,
  addRequestNote,
  createSlot,
  listSlots,
  deleteSlot,
  listAppointments,
} from './adminCounselling.controller';

const router = Router();

// Counselling ops are open to admins and counsellors.
router.use(requireRole('admin', 'counsellor'));

// Requests
router.get('/requests', validate({ query: listRequestsQuery }), listRequests);
router.patch('/requests/:id', validate({ params: idParams, body: updateRequestBody }), updateRequest);
router.post('/requests/:id/notes', validate({ params: idParams, body: addNoteBody }), addRequestNote);

// Slots
router.post('/slots', validate({ body: createSlotBody }), createSlot);
router.get('/slots', validate({ query: listSlotsQuery }), listSlots);
router.delete('/slots/:id', validate({ params: idParams }), deleteSlot);

// Appointments
router.get('/appointments', validate({ query: listAppointmentsQuery }), listAppointments);

export default router;
