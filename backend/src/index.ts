import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient as UsersPrismaClient } from '@prisma/client/users';
import { PrismaClient as AppPrismaClient } from '@prisma/client/app';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_kavach_key_123';

app.use(cors());
app.use(express.json());

const usersDb = new UsersPrismaClient();
const appDb = new AppPrismaClient();

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// --- PUBLIC ROUTES ---

app.get('/', (req, res) => {
  res.json({
    message: "Welcome to the Kavach Wristband Backend!",
    endpoints: ["/health", "/api/register", "/api/login", "/api/me", "/api/devices"]
  });
});

app.get('/health', async (req, res) => {
  try {
    await usersDb.$queryRaw`SELECT 1`;
    await appDb.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Connected to both Users DB and App DB successfully.' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
    const existingUser = await usersDb.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await usersDb.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      }
    });

    res.status(201).json({ message: 'User registered successfully!', userId: newUser.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await usersDb.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Create and sign JWT
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ message: 'Logged in successfully', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

import { startBackupService } from './backupService';

// --- PROTECTED ROUTES ---

app.get('/api/me', authenticateToken, async (req: any, res: any) => {
  try {
    const user = await usersDb.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const devices = await appDb.device.findMany();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Telemetry Endpoints
app.post('/api/telemetry', async (req, res) => {
  try {
    const { deviceMac, temperature, heartRate, spo2, isAlert, action } = req.body;
    
    // Upsert the device so we don't need to manually create it
    const device = await appDb.device.upsert({
      where: { deviceMac },
      update: {},
      create: {
        userId: 'admin-1', // Default placeholder
        deviceMac,
        name: 'Kavach Band Simulator'
      }
    });

    const telemetry = await appDb.telemetry.create({
      data: {
        deviceId: device.id,
        temperature,
        heartRate,
        spo2,
        isAlert,
        action
      }
    });
    res.json(telemetry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/telemetry', authenticateToken, async (req, res) => {
  try {
    const telemetry = await appDb.telemetry.findMany({
      take: 20,
      orderBy: { timestamp: 'desc' },
      include: { device: true }
    });
    res.json(telemetry.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start the automated JSON backup service
startBackupService();

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
