import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authenticateUser, getProfile);

export default router;
