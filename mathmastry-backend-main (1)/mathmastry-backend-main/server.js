require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const cookieParser = require('cookie-parser');


const prisma = new PrismaClient();
const app = express();

//   import routes
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require("./src/routes/admin.routes");
const teacherRoutes = require("./src/routes/teacher.routes");
const studentRoutes = require("./src/routes/student.routes");

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,      // allow any origin during development
  credentials: true,               // allow cookies to be sent
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());            // parse cookies

// Routes
app.use('/api/auth', authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);

// Health check with DB verification
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'ERROR', database: 'disconnected' });
  }
});

const PORT = process.env.PORT || 5000;

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing server and database...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing server and database...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});