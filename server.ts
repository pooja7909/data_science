import express from "express";
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";
import { Server } from "socket.io";
import { createServer } from "http";

const db = new Database("data.db");

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    yearGroup TEXT NOT NULL,
    groupName TEXT NOT NULL,
    academicYear TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    maxMarks INTEGER NOT NULL,
    date TEXT NOT NULL,
    yearGroup TEXT NOT NULL,
    academicYear TEXT NOT NULL,
    questions TEXT -- JSON string
  );

  CREATE TABLE IF NOT EXISTS marks (
    id TEXT PRIMARY KEY,
    studentId TEXT NOT NULL,
    assessmentId TEXT NOT NULL,
    score REAL NOT NULL,
    questionScores TEXT, -- JSON string
    FOREIGN KEY(studentId) REFERENCES students(id),
    FOREIGN KEY(assessmentId) REFERENCES assessments(id)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    yearGroup TEXT NOT NULL,
    academicYear TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boundaries (
    yearGroup TEXT NOT NULL,
    grade TEXT NOT NULL,
    minPercentage INTEGER NOT NULL,
    PRIMARY KEY(yearGroup, grade)
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API Routes
  app.get("/api/data", (req, res) => {
    try {
      const students = db.prepare("SELECT * FROM students").all();
      const assessments = db.prepare("SELECT * FROM assessments").all().map((a: any) => ({
        ...a,
        questions: a.questions ? JSON.parse(a.questions) : undefined
      }));
      const marks = db.prepare("SELECT * FROM marks").all().map((m: any) => ({
        ...m,
        questionScores: m.questionScores ? JSON.parse(m.questionScores) : undefined
      }));
      const groups = db.prepare("SELECT * FROM groups").all();
      const boundariesRaw = db.prepare("SELECT * FROM boundaries").all();
      
      const yearBoundaries: any = {};
      boundariesRaw.forEach((b: any) => {
        if (!yearBoundaries[b.yearGroup]) yearBoundaries[b.yearGroup] = [];
        yearBoundaries[b.yearGroup].push({ grade: b.grade, minPercentage: b.minPercentage });
      });

      res.json({ students, assessments, marks, groups, yearBoundaries });
    } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

  app.post("/api/save-all", (req, res) => {
    const { students, assessments, marks, groups, yearBoundaries } = req.body;
    
    const transaction = db.transaction(() => {
      // Clear existing data (simple approach for this app)
      db.prepare("DELETE FROM marks").run();
      db.prepare("DELETE FROM assessments").run();
      db.prepare("DELETE FROM students").run();
      db.prepare("DELETE FROM groups").run();
      db.prepare("DELETE FROM boundaries").run();

      // Insert students
      const insertStudent = db.prepare("INSERT INTO students (id, name, yearGroup, groupName, academicYear) VALUES (?, ?, ?, ?, ?)");
      students.forEach((s: any) => insertStudent.run(s.id, s.name, s.yearGroup, s.groupName, s.academicYear));

      // Insert assessments
      const insertAssessment = db.prepare("INSERT INTO assessments (id, name, subject, maxMarks, date, yearGroup, academicYear, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      assessments.forEach((a: any) => insertAssessment.run(a.id, a.name, a.subject, a.maxMarks, a.date, a.yearGroup, a.academicYear, JSON.stringify(a.questions || [])));

      // Insert marks
      const insertMark = db.prepare("INSERT INTO marks (id, studentId, assessmentId, score, questionScores) VALUES (?, ?, ?, ?, ?)");
      marks.forEach((m: any) => insertMark.run(m.id, m.studentId, m.assessmentId, m.score, JSON.stringify(m.questionScores || {})));

      // Insert groups
      const insertGroup = db.prepare("INSERT INTO groups (id, name, yearGroup, academicYear) VALUES (?, ?, ?, ?)");
      groups.forEach((g: any) => insertGroup.run(g.id, g.name, g.yearGroup, g.academicYear));

      // Insert boundaries
      const insertBoundary = db.prepare("INSERT OR REPLACE INTO boundaries (yearGroup, grade, minPercentage) VALUES (?, ?, ?)");
      Object.entries(yearBoundaries).forEach(([yearGroup, boundaries]: [string, any]) => {
        if (Array.isArray(boundaries)) {
          boundaries.forEach((b: any) => {
            if (b && b.grade && b.minPercentage !== undefined) {
              insertBoundary.run(yearGroup, b.grade, b.minPercentage);
            }
          });
        }
      });
    });

    try {
      transaction();
      // Broadcast update to all clients except the sender if clientId is provided
      const { clientId } = req.body;
      io.emit("data-updated", { senderId: clientId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving data:", error);
      res.status(500).json({ error: "Failed to save data" });
    }
  });
  app.post("/api/login", async (req, res) => {
  const { password } = req.body;
  const storedHash = process.env.HASHED_PASSWORD; // You will set this in Vercel

  if (!storedHash) {
    return res.status(500).json({ error: "Password not configured" });
  }

  const isMatch = await bcrypt.compare(password, storedHash);
  if (isMatch) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Invalid password" });
  }
});

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
