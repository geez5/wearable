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

// ---------------------------------------------------------------------------
// SSE Client Registry — broadcast new telemetry to all connected dashboards
// ---------------------------------------------------------------------------
type SseClient = { id: number; res: express.Response };
let sseClients: SseClient[] = [];
let sseClientIdCounter = 0;

function broadcastTelemetry(data: object) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(({ res }) => {
    try { res.write(payload); } catch (_) { /* client may have disconnected */ }
  });
}

// ---------------------------------------------------------------------------
// Middleware to verify JWT
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Scenario definitions used by /api/simulate
// ---------------------------------------------------------------------------
const SCENARIOS: Record<string, { temperature: number; heartRate: number; spo2: number; systolicBP?: number; diastolicBP?: number; isAlert: boolean; action: string }> = {
  normal: {
    temperature: 36.6,
    heartRate: 75,
    spo2: 98,
    systolicBP: 120,
    diastolicBP: 80,
    isAlert: false,
    action: 'Vitals are normal. You are safe.',
  },
  heatstroke: {
    temperature: 39.8,
    heartRate: 110,
    spo2: 96,
    systolicBP: 135,
    diastolicBP: 88,
    isAlert: true,
    action: 'HEATSTROKE RISK! Cool down rapidly, seek shade, call 911.',
  },
  hypothermia: {
    temperature: 33.5,
    heartRate: 52,
    spo2: 94,
    systolicBP: 100,
    diastolicBP: 65,
    isAlert: true,
    action: 'HYPOTHERMIA RISK! Move indoors, drink warm fluids.',
  },
  high_hr: {
    temperature: 37.0,
    heartRate: 142,
    spo2: 88,
    systolicBP: 130,
    diastolicBP: 85,
    isAlert: true,
    action: 'HIGH HR DETECTED! Sit down, rest, and take deep breaths.',
  },
  low_spo2: {
    temperature: 36.8,
    heartRate: 95,
    spo2: 89,
    systolicBP: 118,
    diastolicBP: 78,
    isAlert: true,
    action: 'LOW OXYGEN! Move to fresh air, breathe deeply.',
  },
  high_bp: {
    temperature: 37.0,
    heartRate: 88,
    spo2: 97,
    systolicBP: 165,
    diastolicBP: 105,
    isAlert: true,
    action: 'HIGH BLOOD PRESSURE! Rest immediately, avoid exertion, seek medical attention.',
  },
  low_bp: {
    temperature: 36.5,
    heartRate: 55,
    spo2: 96,
    systolicBP: 85,
    diastolicBP: 55,
    isAlert: true,
    action: 'LOW BLOOD PRESSURE! Lie down flat, hydrate, call for medical help if fainting occurs.',
  },
};

// ---------------------------------------------------------------------------
// PUBLIC ROUTES
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Kavach Wristband Backend!',
    endpoints: ['/health', '/api/register', '/api/login', '/api/me', '/api/devices', '/api/telemetry', '/api/telemetry/stream', '/api/simulate'],
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

    const existingUser = await usersDb.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await usersDb.user.create({
      data: { email, password: hashedPassword, name },
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

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Logged in successfully', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

import { startBackupService } from './backupService';

// ---------------------------------------------------------------------------
// PROTECTED ROUTES
// ---------------------------------------------------------------------------

app.get('/api/me', authenticateToken, async (req: any, res: any) => {
  try {
    const user = await usersDb.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
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

// ---------------------------------------------------------------------------
// Telemetry — ingest from real wristband / mock script
// ---------------------------------------------------------------------------
app.post('/api/telemetry', async (req, res) => {
  try {
    const { deviceMac, temperature, heartRate, spo2, systolicBP, diastolicBP, isAlert, action } = req.body;

    const device = await appDb.device.upsert({
      where: { deviceMac },
      update: {},
      create: {
        userId: 'admin-1',
        deviceMac,
        name: 'Kavach Band Simulator',
      },
    });

    const telemetry = await appDb.telemetry.create({
      data: { deviceId: device.id, temperature, heartRate, spo2, systolicBP, diastolicBP, isAlert, action },
      include: { device: true },
    });

    broadcastTelemetry(telemetry);
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
      include: { device: true },
    });
    res.json(telemetry.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// SSE Stream — real-time push to dashboard clients
// EventSource cannot set custom headers, so we also accept ?token= query param
// ---------------------------------------------------------------------------
const authenticateTokenOrQuery = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const queryToken = req.query?.token as string | undefined;
  const token = headerToken || queryToken;

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

app.get('/api/telemetry/stream', authenticateTokenOrQuery, (req: any, res: any) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if applicable
  res.flushHeaders();

  // Send a heartbeat comment every 15s to keep the connection alive
  res.write(': heartbeat\n\n');
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 15000);

  const clientId = ++sseClientIdCounter;
  const client: SseClient = { id: clientId, res };
  sseClients.push(client);
  console.log(`[SSE] Client #${clientId} connected. Total: ${sseClients.length}`);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`[SSE] Client #${clientId} disconnected. Total: ${sseClients.length}`);
  });
});

// ---------------------------------------------------------------------------
// Simulate — inject a named health scenario from the dashboard
// ---------------------------------------------------------------------------
app.post('/api/simulate', authenticateToken, async (req: any, res: any) => {
  try {
    const { scenario } = req.body as { scenario: string };
    const scenarioData = SCENARIOS[scenario];

    if (!scenarioData) {
      return res.status(400).json({ error: `Unknown scenario "${scenario}". Valid: ${Object.keys(SCENARIOS).join(', ')}` });
    }

    const SIMULATOR_MAC = 'SIM:00:00:00:00:01';

    const device = await appDb.device.upsert({
      where: { deviceMac: SIMULATOR_MAC },
      update: {},
      create: {
        userId: 'admin-1',
        deviceMac: SIMULATOR_MAC,
        name: 'Dashboard Simulator',
      },
    });

    const telemetry = await appDb.telemetry.create({
      data: {
        deviceId: device.id,
        ...scenarioData,
      },
      include: { device: true },
    });

    broadcastTelemetry(telemetry);
    console.log(`[Simulate] Scenario "${scenario}" injected.`);
    res.json({ message: `Scenario "${scenario}" injected successfully.`, telemetry });
  } catch (error: any) {
    console.error('[Simulate] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
startBackupService();

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
