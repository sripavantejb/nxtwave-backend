import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByEmail, createUser, findUserById } from '../services/userService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

/**
 * Register a new user
 * POST /auth/register
 * Body: { name, email, password }
 */
export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Name, email, and password are required' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }
    
    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User with this email already exists' 
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Create user
    const user = createUser({
      name,
      email,
      passwordHash
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data (without password hash) and token
    res.status(201).json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register user' 
    });
  }
}

/**
 * Login user
 * POST /auth/login
 * Body: { email, password }
 */
export async function login(req, res) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  let userEmail = '';
  
  try {
    const { email, password } = req.body;
    userEmail = email || 'unknown';
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    // Find user
    let user;
    try {
      user = findUserByEmail(email);
    } catch (findUserError) {
      console.error('Error finding user by email:', {
        email: userEmail,
        error: findUserError instanceof Error ? findUserError.message : String(findUserError),
        stack: findUserError instanceof Error ? findUserError.stack : undefined
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { details: 'Error occurred while looking up user' })
      });
    }
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    // Validate passwordHash exists and is a string
    if (!user.passwordHash) {
      console.error('User missing passwordHash:', {
        email: userEmail,
        userId: user.userId,
        userKeys: Object.keys(user)
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { details: 'User account data is corrupted - missing password hash' })
      });
    }
    
    if (typeof user.passwordHash !== 'string') {
      console.error('User passwordHash is not a string:', {
        email: userEmail,
        userId: user.userId,
        passwordHashType: typeof user.passwordHash
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { details: 'User account data is corrupted - invalid password hash format' })
      });
    }
    
    // Validate bcrypt hash format (should start with $2a$, $2b$, or $2y$)
    if (!user.passwordHash.match(/^\$2[ayb]\$\d{2}\$/)) {
      console.error('User passwordHash has invalid format:', {
        email: userEmail,
        userId: user.userId,
        hashPrefix: user.passwordHash.substring(0, 10)
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { details: 'User account data is corrupted - invalid password hash format' })
      });
    }
    
    // Verify password with specific error handling
    let isValidPassword = false;
    try {
      isValidPassword = await bcrypt.compare(password, user.passwordHash);
    } catch (bcryptError) {
      console.error('Bcrypt comparison error:', {
        email: userEmail,
        userId: user.userId,
        error: bcryptError instanceof Error ? bcryptError.message : String(bcryptError),
        errorType: bcryptError instanceof Error ? bcryptError.constructor.name : typeof bcryptError,
        stack: bcryptError instanceof Error ? bcryptError.stack : undefined
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { 
          details: 'Error occurred during password verification',
          errorType: bcryptError instanceof Error ? bcryptError.constructor.name : typeof bcryptError
        })
      });
    }
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    // Generate JWT token
    let token;
    try {
      token = jwt.sign(
        { userId: user.userId },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
    } catch (jwtError) {
      console.error('JWT signing error:', {
        email: userEmail,
        userId: user.userId,
        error: jwtError instanceof Error ? jwtError.message : String(jwtError),
        errorType: jwtError instanceof Error ? jwtError.constructor.name : typeof jwtError,
        stack: jwtError instanceof Error ? jwtError.stack : undefined
      });
      return res.status(500).json({ 
        error: 'Failed to login',
        ...(isDevelopment && { 
          details: 'Error occurred while generating authentication token',
          errorType: jwtError instanceof Error ? jwtError.constructor.name : typeof jwtError
        })
      });
    }
    
    // Return user data (without password hash) and token
    res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error (unexpected):', {
      email: userEmail,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: req.body ? { email: req.body.email, hasPassword: !!req.body.password } : 'no body'
    });
    
    res.status(500).json({ 
      error: 'Failed to login',
      ...(isDevelopment && { 
        details: error instanceof Error ? error.message : 'An unexpected error occurred',
        errorType: error instanceof Error ? error.constructor.name : typeof error
      })
    });
  }
}

/**
 * Get current user profile
 * GET /auth/me
 * Requires authentication
 */
export function getProfile(req, res) {
  try {
    const user = findUserById(req.userId);
    
    if (!user) {
      // User not found - this could happen if user was deleted or data is inconsistent
      // Return 401 to indicate authentication issue (token is valid but user doesn't exist)
      console.warn(`User ${req.userId} not found in database`);
      return res.status(401).json({ 
        error: 'User not found',
        message: 'Your account may have been removed or there is a data inconsistency. Please log in again.'
      });
    }
    
    res.json({
      userId: req.userId,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
