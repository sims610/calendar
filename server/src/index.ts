import app from './service.ts';
import { initializeDatabase } from './database/database.ts';

await initializeDatabase();

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

