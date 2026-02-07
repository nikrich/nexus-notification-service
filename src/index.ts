import { createApp } from './server.js';
import { getDatabase } from './db/client.js';

const PORT = parseInt(process.env.PORT || '3003', 10);

const db = getDatabase();
const { app } = createApp({ db });

app.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
});
