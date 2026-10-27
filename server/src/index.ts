import app from './service.ts';
import { initializeDatabase } from './database/database.ts';
import { startReminders } from './reminders.ts';

await initializeDatabase();
startReminders();

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

