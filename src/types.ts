export type YearGroup = 7 | 8 | 9 | '10 IGCSE' | '11 IGCSE' | '12 IB' | '13 IB' | 'Graduated';

export interface Student {
  id: string;
  name: string;
  yearGroup: YearGroup;
  groupName: string;
  academicYear: string;
}

export interface Group {
  id: string;
  yearGroup: YearGroup;
  name: string;
  academicYear: string;
}

export interface Question {
  number: string;
  maxMarks: number;
}

export interface Assessment {
  id: string;
  name: string;
  subject: string;
  date: string;
  maxMarks: number;
  yearGroup: YearGroup;
  academicYear: string;
  boundaries?: GradeBoundary[];
  questions?: Question[];
}

export interface Mark {
  id: string;
  studentId: string;
  assessmentId: string;
  score: number;
  questionScores?: Record<string, number>;
}

export interface GradeBoundary {
  grade: string;
  minPercentage: number;
}

export interface StudentPerformance {
  student: Student;
  marks: (Mark & { assessment: Assessment })[];
  averagePercentage: number;
  trend: 'improving' | 'declining' | 'stable';
  status: 'excellent' | 'on-track' | 'needs-improvement';
}
