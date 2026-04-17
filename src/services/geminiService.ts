import { GoogleGenAI } from "@google/genai";
import { StudentPerformance, GradeBoundary } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateStudentFeedback(
  performance: StudentPerformance,
  boundaries: GradeBoundary[]
) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    As an expert teacher, provide a concise, encouraging, and constructive feedback for a student based on their assessment data.
    
    Student Name: ${performance.student.name}
    Year Group: ${performance.student.yearGroup}
    Average Percentage: ${performance.averagePercentage.toFixed(1)}%
    Performance Status: ${performance.status}
    Trend: ${performance.trend}
    
    Recent Assessments:
    ${performance.marks.map(m => `- ${m.assessment.name} (${m.assessment.subject}): ${m.score}/${m.assessment.maxMarks} (${((m.score / m.assessment.maxMarks) * 100).toFixed(1)}%)`).join('\n')}
    
    Grade Boundaries:
    ${boundaries.map(b => `- Grade ${b.grade}: ${b.minPercentage}%`).join('\n')}
    
    Please provide:
    1. A summary of their current performance.
    2. Specific areas of strength.
    3. Actionable advice for improvement.
    4. A motivational closing statement.
    
    Keep the feedback professional yet warm.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "Could not generate feedback at this time.";
  } catch (error) {
    console.error("Error generating feedback:", error);
    return "Error generating feedback. Please try again.";
  }
}
