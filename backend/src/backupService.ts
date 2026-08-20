import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { PrismaClient as UsersPrismaClient } from '@prisma/client/users';
import { PrismaClient as AppPrismaClient } from '@prisma/client/app';

const usersDb = new UsersPrismaClient();
const appDb = new AppPrismaClient();

const BACKUP_DIR = path.join(__dirname, '..', 'data_backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}

export function startBackupService() {
  console.log('JSON Backup Service initialized. Running every 10 seconds...');

  // Run every 10 seconds to keep it constantly updated
  cron.schedule('*/10 * * * * *', async () => {
    try {
      // 1. Fetch all users (excluding passwords for safety)
      const users = await usersDb.user.findMany({
        select: { id: true, email: true, name: true, role: true, createdAt: true }
      });
      fs.writeFileSync(
        path.join(BACKUP_DIR, 'users_db_backup.json'), 
        JSON.stringify(users, null, 2)
      );

      // 2. Fetch all devices and their telemetry
      const devices = await appDb.device.findMany({
        include: { telemetries: true }
      });
      fs.writeFileSync(
        path.join(BACKUP_DIR, 'app_db_backup.json'), 
        JSON.stringify(devices, null, 2)
      );

      // 3. Fetch all raw telemetry separately if needed
      const telemetries = await appDb.telemetry.findMany();
      fs.writeFileSync(
        path.join(BACKUP_DIR, 'telemetry_db_backup.json'), 
        JSON.stringify(telemetries, null, 2)
      );

    } catch (error) {
      console.error('Error during automated JSON backup:', error);
    }
  });
}
