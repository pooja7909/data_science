import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  BarChart3, 
  Settings, 
  Plus, 
  Upload, 
  ChevronRight, 
  ChevronDown,
  TrendingUp, 
  TrendingDown, 
  Minus,
  Trash2,
  Download,
  Edit2,
  Search,
  Filter,
  X,
  FileText,
  List,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cloud,
  History,
  RefreshCw,
  Database
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell
} from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI, Type } from "@google/genai";
import { getStudents, getAssessments, getMarks, getGroups, getYearBoundaries, updateYearBoundaries, deleteStudent as fbDeleteStudent, deleteAssessment as fbDeleteAssessment, deleteMark as fbDeleteMark, deleteGroup as fbDeleteGroup } from './services/firebaseService';
import { db } from './firebase';
import { setDoc, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';

import { 
  Student, 
  Assessment, 
  Mark, 
  GradeBoundary, 
  YearGroup, 
  StudentPerformance,
  Group,
  Question
} from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SUBJECTS_BY_YEAR: Record<YearGroup, string[]> = {
  7: ['Computer Science'],
  8: ['Computer Science'],
  9: ['Computer Science'],
  '10 IGCSE': ['Computer Science'],
  '11 IGCSE': ['Computer Science'],
  '12 IB': ['Computer Science'],
  '13 IB': ['Computer Science'],
  'Graduated': ['Computer Science'],
};

const SUBJECT_COLORS: Record<string, string> = {
  'Computer Science': '#8b5cf6', // Violet
};

const KS3_BOUNDARIES: GradeBoundary[] = [
  { grade: 'Outstanding', minPercentage: 90 },
  { grade: 'Significantly Above', minPercentage: 80 },
  { grade: 'Above', minPercentage: 70 },
  { grade: 'At', minPercentage: 50 },
  { grade: 'Below', minPercentage: 40 },
  { grade: 'Significantly below', minPercentage: 0 },
];

const IGCSE_BOUNDARIES: GradeBoundary[] = [
  { grade: '9', minPercentage: 90 },
  { grade: '8', minPercentage: 80 },
  { grade: '7', minPercentage: 70 },
  { grade: '6', minPercentage: 60 },
  { grade: '5', minPercentage: 50 },
  { grade: '4', minPercentage: 40 },
  { grade: '3', minPercentage: 30 },
  { grade: '2', minPercentage: 20 },
  { grade: '1', minPercentage: 0 },
];

const IB_BOUNDARIES: GradeBoundary[] = [
  { grade: '7', minPercentage: 90 },
  { grade: '6', minPercentage: 80 },
  { grade: '5', minPercentage: 70 },
  { grade: '4', minPercentage: 60 },
  { grade: '3', minPercentage: 50 },
  { grade: '2', minPercentage: 40 },
  { grade: '1', minPercentage: 0 },
];

const DEFAULT_BOUNDARIES: GradeBoundary[] = KS3_BOUNDARIES;

const INITIAL_STUDENTS: Student[] = [];

const INITIAL_ASSESSMENTS: Assessment[] = [];

const INITIAL_MARKS: Mark[] = [];

const ACADEMIC_YEARS = Array.from({ length: 2035 - 2023 + 1 }, (_, i) => {
  const startYear = 2023 + i;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, '0')}`;
});
const CURRENT_ACADEMIC_YEAR = '2025-26';

const getNextAcademicYear = (current: string): string | null => {
  const idx = ACADEMIC_YEARS.indexOf(current);
  return idx < ACADEMIC_YEARS.length - 1 ? ACADEMIC_YEARS[idx + 1] : null;
};

const getPreviousAcademicYear = (current: string): string | null => {
  const idx = ACADEMIC_YEARS.indexOf(current);
  return idx > 0 ? ACADEMIC_YEARS[idx - 1] : null;
};

const getNextYearGroup = (current: YearGroup): YearGroup | 'Graduated' | null => {
  if (current === 7) return 8;
  if (current === 8) return 9;
  if (current === 9) return '10 IGCSE';
  if (current === '10 IGCSE') return '11 IGCSE';
  if (current === '11 IGCSE') return '12 IB';
  if (current === '12 IB') return '13 IB';
  if (current === '13 IB') return 'Graduated';
  return null;
};

const getPreviousYearGroup = (current: YearGroup | 'Graduated'): YearGroup | null => {
  if (current === 8) return 7;
  if (current === 9) return 8;
  if (current === '10 IGCSE') return 9;
  if (current === '11 IGCSE') return '10 IGCSE';
  if (current === '12 IB') return '11 IGCSE';
  if (current === '13 IB') return '12 IB';
  if (current === 'Graduated') return '13 IB';
  return null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'performance' | 'students' | 'assessments' | 'settings'>('dashboard');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(CURRENT_ACADEMIC_YEAR);
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [assessments, setAssessments] = useState<Assessment[]>(INITIAL_ASSESSMENTS);
  const [marks, setMarks] = useState<Mark[]>(INITIAL_MARKS);
  const [yearBoundaries, setYearBoundaries] = useState<Record<string, GradeBoundary[]>>({
    '7': [...KS3_BOUNDARIES],
    '8': [...KS3_BOUNDARIES],
    '9': [...KS3_BOUNDARIES],
    '10 IGCSE': [...IGCSE_BOUNDARIES],
    '11 IGCSE': [...IGCSE_BOUNDARIES],
    '12 IB': [...IB_BOUNDARIES],
    '13 IB': [...IB_BOUNDARIES],
  });
  const [selectedSettingScope, setSelectedSettingScope] = useState<string>('7');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<YearGroup | 'all' | 'IGCSE_ALL' | 'IB_ALL'>(7);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [showMarksModal, setShowMarksModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<{assessments: string[], students: number, marks: number, groups: string[]} | null>(null);
  const [importColumnSubjects, setImportColumnSubjects] = useState<Record<string, string>>({});
  const [pendingImport, setPendingImport] = useState<{ data: any[], fileName: string, sheetName?: string } | null>(null);
  const [importConfig, setImportConfig] = useState({ 
    yearGroup: 7 as YearGroup, 
    groupName: '', 
    assessmentName: '', 
    subject: 'Computer Science', 
    maxMarks: 100, 
    date: new Date().toISOString().split('T')[0] 
  });
  const [marksGroupFilter, setMarksGroupFilter] = useState<string>('all');
  const [newAssessment, setNewAssessment] = useState({ name: '', subject: 'Computer Science', maxMarks: 100, date: new Date().toISOString().split('T')[0], yearGroup: 7 as YearGroup });
  const [newStudent, setNewStudent] = useState<{
    name: string;
    preferredName: string;
    yearGroup: YearGroup;
    groupName: string;
    ibLevel?: 'HL' | 'SL';
    isNew: boolean;
    notes: string;
  }>({ name: '', preferredName: '', yearGroup: 7 as YearGroup, groupName: '', isNew: false, notes: '' });
  const [performanceSubjectFilter, setPerformanceSubjectFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [ibLevelFilter, setIbLevelFilter] = useState<'all' | 'HL' | 'SL'>('all');
  const [modalGroupFilter, setModalGroupFilter] = useState<string>('all');
  const [marksLevelFilter, setMarksLevelFilter] = useState<'all' | 'HL' | 'SL'>('all');
  const [selectedStudentForPerformance, setSelectedStudentForPerformance] = useState<string | 'none'>('none');
  const [showPaperGradingModal, setShowPaperGradingModal] = useState<string | null>(null);
  const [extractionMode, setExtractionMode] = useState<'questions' | 'subparts'>('questions');
  const [marksheetSort, setMarksheetSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'level', direction: 'asc' });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [useCloudSync, setUseCloudSync] = useState<boolean>(() => {
    const saved = localStorage.getItem('science-tracker-use-cloud');
    return saved === null ? true : saved === 'true';
  });
  const isFetching = React.useRef(false);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['year-7'])); // Default Year 7 expanded

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  useEffect(() => {
    if (groupFilter !== 'all') {
      // Find which year this group belongs to and auto-expand
      const student = students.find(s => s.groupName === groupFilter && s.academicYear === selectedAcademicYear);
      if (student) {
        const yearSectionId = `year-${student.yearGroup}`;
        const groupSectionId = `group-${student.yearGroup}-${groupFilter}`;
        setExpandedSections(prev => {
          const next = new Set(prev);
          next.add(yearSectionId);
          next.add(groupSectionId);
          return next;
        });
      }
    }
  }, [groupFilter, students, selectedAcademicYear]);

  // Auto-expand the selected year section in the sidebar
  useEffect(() => {
    if (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') {
      setExpandedSections(prev => {
        const next = new Set(prev);
        next.add(`year-${yearFilter}`);
        return next;
      });
    }
  }, [yearFilter]);

  // Reset modal filters when modals are closed
  useEffect(() => {
    if (!showMarksModal) {
      setMarksGroupFilter('all');
      setMarksLevelFilter('all');
    }
  }, [showMarksModal]);

  useEffect(() => {
    if (!showPaperGradingModal) setModalGroupFilter('all');
  }, [showPaperGradingModal]);

  // #8: Escape key closes any open modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showMarksModal) { setShowMarksModal(null); return; }
      if (showPaperGradingModal) { setShowPaperGradingModal(null); return; }
      if (showAssessmentModal) { setShowAssessmentModal(false); setEditingAssessmentId(null); return; }
      if (showStudentModal) { setShowStudentModal(false); return; }
      if (showImportModal) { setShowImportModal(false); setPendingImport(null); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMarksModal, showPaperGradingModal, showAssessmentModal, showStudentModal, showImportModal]);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      isFetching.current = true;
      try {
        // --- DATA RECOVERY ---
        // Attempt to find any lost data in common localStorage keys
        const recoveryKeys = [
          'science-tracker-students', 'marks-data-students', 'students',
          'science-tracker-assessments', 'marks-data-assessments', 'assessments',
          'science-tracker-marks', 'marks-data-marks', 'marks',
          'science-tracker-groups', 'marks-data-groups', 'groups',
          'science-tracker-boundaries', 'yearBoundaries'
        ];
        
        const localData: Record<string, any> = {};
        recoveryKeys.forEach(key => {
          const val = localStorage.getItem(key);
          if (val) {
            try { localData[key] = JSON.parse(val); } catch(e) {}
          }
        });

        // Initialize state with recovered data if available
        if (localData['science-tracker-students'] || localData['marks-data-students'] || localData['students']) {
          const s = localData['science-tracker-students'] || localData['marks-data-students'] || localData['students'];
          if (Array.isArray(s)) setStudents(s);
        }
        if (localData['science-tracker-assessments'] || localData['marks-data-assessments'] || localData['assessments']) {
          const a = localData['science-tracker-assessments'] || localData['marks-data-assessments'] || localData['assessments'];
          if (Array.isArray(a)) setAssessments(a);
        }
        if (localData['science-tracker-marks'] || localData['marks-data-marks'] || localData['marks']) {
          const m = localData['science-tracker-marks'] || localData['marks-data-marks'] || localData['marks'];
          if (Array.isArray(m)) setMarks(m);
        }
        if (localData['science-tracker-groups'] || localData['marks-data-groups'] || localData['groups']) {
          const g = localData['science-tracker-groups'] || localData['marks-data-groups'] || localData['groups'];
          if (Array.isArray(g)) setGroups(g);
        }
        if (localData['science-tracker-boundaries'] || localData['yearBoundaries']) {
          const b = localData['science-tracker-boundaries'] || localData['yearBoundaries'];
          if (b && typeof b === 'object') setYearBoundaries(b as any);
        }

        if (useCloudSync) {
          console.log("Fetching data from Firebase...");
          const [fbStudents, fbAssessments, fbMarks, fbGroups, fbBoundaries] = await Promise.all([
            getStudents(),
            getAssessments(),
            getMarks(),
            getGroups(),
            getYearBoundaries()
          ]);
          
          if (fbStudents && fbStudents.length > 0) setStudents(fbStudents);
          if (fbAssessments && fbAssessments.length > 0) setAssessments(fbAssessments);
          if (fbMarks && fbMarks.length > 0) {
            const uniqueMarks: Mark[] = [];
            const markKeys = new Set<string>();
            fbMarks.forEach(m => {
              const key = `${m.studentId}_${m.assessmentId}`;
              if (!markKeys.has(key)) {
                markKeys.add(key);
                uniqueMarks.push(m);
              }
            });
            setMarks(uniqueMarks);
          }
          if (fbGroups && fbGroups.length > 0) setGroups(fbGroups);
          if (fbBoundaries) setYearBoundaries(fbBoundaries as Record<string, GradeBoundary[]>);
          
          console.log("Cloud data synced.");
        }
      } catch (error) {
        console.error("Failed to fetch/sync data:", error);
      } finally {
        isFetching.current = false;
        setIsInitialLoading(false);
        setHasLoaded(true);
      }
    };
    fetchData();

    // Fallback: ensure app loads even if data fetch hangs
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
      setHasLoaded(true);
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [useCloudSync]);

  // Save data when state changes
  useEffect(() => {
    if (!hasLoaded || isFetching.current) return;

    const saveData = async () => {
      // Backup to localStorage
      try {
        localStorage.setItem('science-tracker-students', JSON.stringify(students));
        localStorage.setItem('science-tracker-assessments', JSON.stringify(assessments));
        localStorage.setItem('science-tracker-marks', JSON.stringify(marks));
        localStorage.setItem('science-tracker-groups', JSON.stringify(groups));
        localStorage.setItem('science-tracker-boundaries', JSON.stringify(yearBoundaries));
        localStorage.setItem('science-tracker-use-cloud', String(useCloudSync));
      } catch (e) {}

      if (useCloudSync) {
        setSaveStatus('saving');
        try {
          console.log("Saving data to Firebase...");
          // Save all students, assessments, marks, groups, and year boundaries to Firebase
          await Promise.all([
            ...students.map(s => setDoc(doc(db, 'students', s.id), cleanFirestoreData({
              ...s,
              yearGroup: migrateYear(s.yearGroup)
            }))),
            ...assessments.map(a => setDoc(doc(db, 'assessments', a.id), cleanFirestoreData({
              ...a,
              yearGroup: migrateYear(a.yearGroup)
            }))),
            ...marks.map(m => setDoc(doc(db, 'marks', m.id), cleanFirestoreData(m))),
            ...groups.map(g => setDoc(doc(db, 'groups', g.id), cleanFirestoreData({
              ...g,
              yearGroup: migrateYear(g.yearGroup)
            }))),
            updateYearBoundaries(yearBoundaries)
          ]);
          console.log("Data saved successfully.");
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (error) {
          console.error("Failed to save data:", error);
          setSaveStatus('idle');
        }
      }
    };

    const timer = setTimeout(saveData, 1000); // Debounce save
    return () => clearTimeout(timer);
  }, [students, assessments, marks, groups, yearBoundaries, hasLoaded, useCloudSync]);

  // Reset subject filter if not available in new year group
  useEffect(() => {
    if (performanceSubjectFilter === 'all') return;
    
    const availableSubjects = Array.from(new Set(
      yearFilter === 'all' ? Object.values(SUBJECTS_BY_YEAR).flat() :
      yearFilter === 'IGCSE_ALL' ? [...SUBJECTS_BY_YEAR['10 IGCSE'], ...SUBJECTS_BY_YEAR['11 IGCSE']] :
      yearFilter === 'IB_ALL' ? [...SUBJECTS_BY_YEAR['12 IB'], ...SUBJECTS_BY_YEAR['13 IB']] :
      SUBJECTS_BY_YEAR[yearFilter as YearGroup] || []
    ));

    if (!availableSubjects.includes(performanceSubjectFilter)) {
      setPerformanceSubjectFilter('all');
    }
  }, [yearFilter]);

  // Reset IB Level filter if not an IB year
  useEffect(() => {
    if (!(String(yearFilter).includes('IB') || yearFilter === 'IB_ALL')) {
      setIbLevelFilter('all');
    }
  }, [yearFilter]);

  // Helper for year group display
  const formatYearGroup = (y: YearGroup) => {
    return typeof y === 'number' ? `Year ${y}` : y;
  };

  const migrateYear = (y: any): YearGroup => {
    if (y === 10 || y === '10') return '10 IGCSE';
    if (y === 11 || y === '11') return '11 IGCSE';
    if (y === 12 || y === '12') return '12 IB';
    if (y === 13 || y === '13') return '13 IB';
    // Normalise string "7","8","9" back to numbers as per YearGroup type
    if (y === '7') return 7;
    if (y === '8') return 8;
    if (y === '9') return 9;
    return y as YearGroup;
  };

  const cleanFirestoreData = (data: any) => {
    const clean: any = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        if (data[key] !== null && typeof data[key] === 'object' && !Array.isArray(data[key])) {
          clean[key] = cleanFirestoreData(data[key]);
        } else {
          clean[key] = data[key];
        }
      }
    });
    return clean;
  };

  // Helper for year group matching
  const matchesYearFilter = (itemYear: YearGroup, filter: YearGroup | 'all' | 'IGCSE_ALL' | 'IB_ALL') => {
    if (filter === 'all') return itemYear !== 'Graduated';
    
    const itemYearStr = String(itemYear);
    const filterStr = String(filter);
    
    if (filter === 'IGCSE_ALL') return itemYearStr === '10' || itemYearStr === '11' || itemYearStr.includes('IGCSE');
    if (filter === 'IB_ALL') return itemYearStr === '12' || itemYearStr === '13' || itemYearStr.includes('IB');
    
    return itemYearStr === filterStr;
  };

  // Data Migration for old year formats
  useEffect(() => {
    const migratedStudents = students.map(s => ({ ...s, yearGroup: migrateYear(s.yearGroup) }));
    if (JSON.stringify(migratedStudents) !== JSON.stringify(students)) {
      setStudents(migratedStudents);
    }

    const migratedAssessments = assessments.map(a => ({ ...a, yearGroup: migrateYear(a.yearGroup) }));
    if (JSON.stringify(migratedAssessments) !== JSON.stringify(assessments)) {
      setAssessments(migratedAssessments);
    }

    // Also migrate groups yearGroup field
    const migratedGroups = groups.map(g => ({ ...g, yearGroup: migrateYear(g.yearGroup) }));
    if (JSON.stringify(migratedGroups) !== JSON.stringify(groups)) {
      setGroups(migratedGroups);
    }
  }, [students, assessments, groups]);

  // Cleanup orphaned groups (groups with no students) from Firestore and local state
  // Runs across ALL academic years so old ghost groups get purged regardless of selected year
  useEffect(() => {
    if (!hasLoaded || groups.length === 0) return;
    // Build a key set from ALL students across all years
    const studentGroupKeys = new Set(
      students.map(s => `${String(s.yearGroup)}|${s.groupName}|${s.academicYear}`)
    );
    const orphanedGroups = groups.filter(g => 
      !studentGroupKeys.has(`${String(g.yearGroup)}|${g.name}|${g.academicYear}`)
    );
    if (orphanedGroups.length > 0) {
      console.log(`Cleaning up ${orphanedGroups.length} orphaned group(s):`, orphanedGroups.map(g => g.name));
      setGroups(prev => prev.filter(g => 
        studentGroupKeys.has(`${String(g.yearGroup)}|${g.name}|${g.academicYear}`)
      ));
      // Delete from Firestore permanently
      orphanedGroups.forEach(g => {
        deleteDoc(doc(db, 'groups', g.id)).catch(console.error);
      });
    }
  }, [hasLoaded, students, groups]);

  // Derived Data
  const performances = useMemo(() => {
    const currentYearStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

    return currentYearStudents.map(student => {
      // Find previous year record for this student if in 11 IGCSE or 13 IB
      // This fulfills the requirement: "year 10 moves to year 11, year 12 to year 13 along with all their data"
      let priorMarks: (Mark & { assessment: Assessment })[] = [];
      if (student.yearGroup === '11 IGCSE' || student.yearGroup === '13 IB' || student.yearGroup === 'Graduated') {
        const prevYear = getPreviousAcademicYear(selectedAcademicYear);
        const prevYearGroup = student.yearGroup === '11 IGCSE' ? '10 IGCSE' : 
                             student.yearGroup === '13 IB' ? '12 IB' : '13 IB';
        if (prevYear) {
          const prevStudent = students.find(s => s.name === student.name && s.yearGroup === prevYearGroup && s.academicYear === prevYear);
          if (prevStudent) {
            const prevAssessments = assessments.filter(a => a.academicYear === prevYear && a.yearGroup === prevYearGroup);
            priorMarks = marks
              .filter(m => m.studentId === prevStudent.id)
              .map(m => ({
                ...m,
                assessment: prevAssessments.find(a => a.id === m.id || a.id === m.assessmentId)!
              }))
              .filter(m => m.assessment);
          }
        }
      }

      const studentMarks = [
        ...priorMarks,
        ...marks
          .filter(m => m.studentId === student.id)
          .map(m => ({
            ...m,
            assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
          }))
          .filter(m => m.assessment)
      ].sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime());

      // Only include marks where the student actually sat the assessment (not absent)
      const sittingMarks = studentMarks.filter(m => !(m as any).absent);
      const absentCount = studentMarks.length - sittingMarks.length;

      const totalPercentage = sittingMarks.reduce((acc, m) => acc + (m.score / m.assessment.maxMarks) * 100, 0);
      // averagePercentage is only over assessments the student actually sat
      // Returns null if no data at all (new student or all absent) — null propagates through UI as "No data"
      const averagePercentage = sittingMarks.length > 0 ? totalPercentage / sittingMarks.length : null;

      // Trend: only from assessments the student sat, need at least 2
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (sittingMarks.length >= 2) {
        const last = (sittingMarks[sittingMarks.length - 1].score / sittingMarks[sittingMarks.length - 1].assessment.maxMarks) * 100;
        const prev = (sittingMarks[sittingMarks.length - 2].score / sittingMarks[sittingMarks.length - 2].assessment.maxMarks) * 100;
        if (last > prev + 2) trend = 'improving';
        else if (last < prev - 2) trend = 'declining';
      }

      // Status: only meaningful if student has sat at least 1 assessment
      let status: 'excellent' | 'on-track' | 'needs-improvement' | 'no-data' = averagePercentage === null ? 'no-data' : 'on-track';
      if (averagePercentage !== null) {
        const currentBoundaries = yearBoundaries[student.groupName] || yearBoundaries[student.yearGroup] || [];
        const sortedBoundaries = [...currentBoundaries].sort((a, b) => b.minPercentage - a.minPercentage);
        const topBoundary = sortedBoundaries[0]?.minPercentage || 80;
        
        // Define "Fail Range" thresholds based on year group
        let supportThreshold = 50; // Default (KS3 "At" boundary)
        if (String(student.yearGroup).includes('IB')) {
          // Trigger support if below Grade 5 (i.e., at 4 or lower)
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 70;
        } else if (String(student.yearGroup).includes('IGCSE')) {
          // Trigger support if below Grade 5 (i.e., at 4 or lower)
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 50;
        } else {
          // KS3: Trigger support if below "At" grade
          supportThreshold = sortedBoundaries.find(b => b.grade === 'At')?.minPercentage || 50;
        }

        if (averagePercentage >= topBoundary) {
          status = 'excellent';
        } else if (trend === 'declining' && averagePercentage < supportThreshold) {
          status = 'needs-improvement';
        }
      }

      return {
        student,
        marks: studentMarks,       // all marks including absent (for display)
        sittingMarks,              // marks where student actually sat (for calculations)
        absentCount,
        averagePercentage: averagePercentage ?? 0, // 0 for type compat, use status==='no-data' to distinguish
        hasData: averagePercentage !== null,
        trend,
        status
      } as any as StudentPerformance;
    });
  }, [students, assessments, marks, selectedAcademicYear, yearBoundaries, performanceSubjectFilter]);

  const filteredPerformances = useMemo(() => {
    return performances.filter(p => {
      const matchesSearch = p.student.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesYear = matchesYearFilter(p.student.yearGroup, yearFilter);
      const matchesGroup = groupFilter === 'all' || p.student.groupName === groupFilter;
      // Subject filter logic:
      // 1. If student has a subjects[] field (from import), use it directly
      // 2. For Years 7-9, all students take all subjects for their year (Computer Science)
      // 3. For Years 10-13, check marks if no subjects field set
      const studentSubjects: string[] = (p.student as any).subjects?.length
        ? (p.student as any).subjects
        : SUBJECTS_BY_YEAR[p.student.yearGroup] || [];
      const matchesSubject = performanceSubjectFilter === 'all' || 
        studentSubjects.includes(performanceSubjectFilter) || 
        p.marks.some(m => m.assessment.subject === performanceSubjectFilter);
      const matchesLevel = ibLevelFilter === 'all' || p.student.ibLevel === ibLevelFilter;
      return matchesSearch && matchesYear && matchesGroup && matchesSubject && matchesLevel;
    });
  }, [performances, searchQuery, yearFilter, performanceSubjectFilter, groupFilter, ibLevelFilter]);

  const sortedMarksheetPerformances = useMemo(() => {
    return [...filteredPerformances].sort((a, b) => {
      const isIB = a.student.yearGroup === '12 IB' || a.student.yearGroup === '13 IB' || 
                   b.student.yearGroup === '12 IB' || b.student.yearGroup === '13 IB';

      if (marksheetSort.key === 'level' && isIB) {
        // IB Sort: HL then SL, then Name
        const levelOrder = { 'HL': 0, 'SL': 1, 'undefined': 2 };
        const levelA = a.student.ibLevel || 'undefined';
        const levelB = b.student.ibLevel || 'undefined';
        
        if (levelOrder[levelA] !== levelOrder[levelB]) {
          return marksheetSort.direction === 'asc' 
            ? levelOrder[levelA] - levelOrder[levelB]
            : levelOrder[levelB] - levelOrder[levelA];
        }
        return a.student.name.localeCompare(b.student.name);
      }

      if (marksheetSort.key === 'name') {
        return marksheetSort.direction === 'asc' 
          ? a.student.name.localeCompare(b.student.name)
          : b.student.name.localeCompare(a.student.name);
      }

      if (marksheetSort.key === 'avg') {
        return marksheetSort.direction === 'asc'
          ? a.averagePercentage - b.averagePercentage
          : b.averagePercentage - a.averagePercentage;
      }

      // Default sort (by level if IB, else name)
      return a.student.name.localeCompare(b.student.name);
    });
  }, [filteredPerformances, marksheetSort]);

  const availableGroups = useMemo(() => {
    const currentYearStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    let filtered = currentYearStudents.filter(s => matchesYearFilter(s.yearGroup, yearFilter));
    if (ibLevelFilter !== 'all') {
      filtered = filtered.filter(s => s.ibLevel === ibLevelFilter);
    }
    // Only show groups that actually have students - prevents ghost/deleted groups from appearing
    return Array.from(new Set(filtered.map(s => s.groupName))).filter(Boolean).sort();
  }, [students, selectedAcademicYear, yearFilter, ibLevelFilter]);

  const topPerformers = useMemo(() => {
    return [...filteredPerformances]
      .filter(p => (p as any).hasData) // only students who have actually sat at least one assessment
      .sort((a, b) => b.averagePercentage - a.averagePercentage)
      .slice(0, 5);
  }, [filteredPerformances]);

  const needsSupport = useMemo(() => {
    return [...filteredPerformances]
      .filter(p => p.hasData && p.status === 'needs-improvement')
      .sort((a, b) => a.averagePercentage - b.averagePercentage)
      .slice(0, 5);
  }, [filteredPerformances]);

  const performanceTabStats = useMemo(() => {
    const currentYearStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

    return currentYearStudents.map(student => {
      const allStudentMarks = marks
        .filter(m => m.studentId === student.id)
        .map(m => ({
          ...m,
          assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
        }))
        .filter(m => m.assessment && (performanceSubjectFilter === 'all' || m.assessment.subject === performanceSubjectFilter))
        .filter(m => matchesYearFilter(m.assessment.yearGroup, yearFilter))
        .sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime());

      // Exclude absent marks from average — only count assessments actually sat
      const sittingMarks = allStudentMarks.filter(m => !(m as any).absent);
      const totalPercentage = sittingMarks.reduce((acc, m) => acc + (m.score / m.assessment.maxMarks) * 100, 0);
      const averagePercentage = sittingMarks.length > 0 ? totalPercentage / sittingMarks.length : 0;

      // Trend: only from assessments the student sat, need at least 2
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (sittingMarks.length >= 2) {
        const last = (sittingMarks[sittingMarks.length - 1].score / sittingMarks[sittingMarks.length - 1].assessment.maxMarks) * 100;
        const prev = (sittingMarks[sittingMarks.length - 2].score / sittingMarks[sittingMarks.length - 2].assessment.maxMarks) * 100;
        if (last > prev + 2) trend = 'improving';
        else if (last < prev - 2) trend = 'declining';
      }

      // Status logic
      let status: 'excellent' | 'on-track' | 'needs-improvement' | 'no-data' = sittingMarks.length === 0 ? 'no-data' : 'on-track';
      if (sittingMarks.length > 0) {
        const currentBoundaries = yearBoundaries[student.groupName] || yearBoundaries[student.yearGroup] || [];
        const sortedBoundaries = [...currentBoundaries].sort((a, b) => b.minPercentage - a.minPercentage);
        const topBoundary = sortedBoundaries[0]?.minPercentage || 80;
        
        // Define "Fail Range" thresholds based on year group
        let supportThreshold = 50; // Default (KS3 "At" boundary)
        if (String(student.yearGroup).includes('IB')) {
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 70;
        } else if (String(student.yearGroup).includes('IGCSE')) {
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 50;
        } else {
          supportThreshold = sortedBoundaries.find(b => b.grade === 'At')?.minPercentage || 50;
        }

        if (averagePercentage >= topBoundary) {
          status = 'excellent';
        } else if (trend === 'declining' && averagePercentage < supportThreshold) {
          status = 'needs-improvement';
        }
      }

      return {
        student,
        averagePercentage,
        trend,
        status,
        count: sittingMarks.length,         // only assessments actually sat
        totalCount: allStudentMarks.length,  // includes absent
        absentCount: allStudentMarks.length - sittingMarks.length
      };
    }).filter(p => p.count > 0); // exclude students with no real marks at all
  }, [students, assessments, marks, performanceSubjectFilter, yearFilter, selectedAcademicYear, yearBoundaries]);

  const calculateGradeDistribution = (stats: any[], yearFilterScope: string) => {
    // Determine which year group to use for boundaries
    let currentYearGroup: YearGroup = 7;
    if (yearFilterScope !== 'all' && yearFilterScope !== 'IGCSE_ALL' && yearFilterScope !== 'IB_ALL') {
      currentYearGroup = yearFilterScope as YearGroup;
    } else if (stats.length > 0) {
      currentYearGroup = stats[0].student?.yearGroup || stats[0].student.yearGroup || 7;
    }

    const currentBoundaries = yearBoundaries[currentYearGroup] || (
      String(currentYearGroup).includes('IGCSE') ? IGCSE_BOUNDARIES :
      String(currentYearGroup).includes('IB') ? IB_BOUNDARIES : KS3_BOUNDARIES
    );
    const sorted = [...currentBoundaries].sort((a, b) => b.minPercentage - a.minPercentage);

    const data = sorted.map((boundary, idx) => {
      const exclusiveCount = stats.filter(p => {
        const score = p.averagePercentage;
        const hasAnyData = p.hasData !== undefined ? p.hasData : (p.count > 0);
        if (!hasAnyData) return false;
        
        const isMin = score >= boundary.minPercentage;
        const isMax = idx === 0 ? true : score < sorted[idx - 1].minPercentage;
        return isMin && isMax;
      }).length;

      let color = 'bg-blue-500';
      if (idx === 0) color = 'bg-emerald-500';
      else if (idx === sorted.length - 1) color = 'bg-rose-500';
      else if (idx === sorted.length - 2) color = 'bg-orange-500';

      return {
        label: `${boundary.grade} (${boundary.minPercentage}%+)`,
        count: exclusiveCount,
        color
      };
    });

    const noDataCount = stats.filter(p => {
       const hasAnyData = p.hasData !== undefined ? p.hasData : (p.count > 0);
       return !hasAnyData;
    }).length;
    
    if (noDataCount > 0) {
      data.push({ label: 'New / No Data', count: noDataCount, color: 'bg-slate-300' });
    }
    return data;
  };

  const gradeDistribution = useMemo(() => {
    return calculateGradeDistribution(filteredPerformances, yearFilter);
  }, [filteredPerformances, yearFilter, yearBoundaries]);

  const performanceTabGradeDistribution = useMemo(() => {
    return calculateGradeDistribution(performanceTabStats, yearFilter);
  }, [performanceTabStats, yearFilter, yearBoundaries]);

  const topPerformersList = useMemo(() => {
    return [...performanceTabStats]
      .sort((a, b) => b.averagePercentage - a.averagePercentage)
      .slice(0, 5);
  }, [performanceTabStats]);

  const needsSupportList = useMemo(() => {
    return [...performanceTabStats]
      .filter(p => p.status === 'needs-improvement')
      .sort((a, b) => a.averagePercentage - b.averagePercentage)
      .slice(0, 5);
  }, [performanceTabStats]);

  const performanceTabAssessments = useMemo(() => {
    return assessments
      .filter(a => a.academicYear === selectedAcademicYear)
      .filter(a => matchesYearFilter(a.yearGroup, yearFilter))
      .filter(a => performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [assessments, selectedAcademicYear, yearFilter, performanceSubjectFilter]);

  const performanceInsights = useMemo(() => {
    if (performanceTabStats.length === 0) return null;

    // performanceTabStats already filters to students with count > 0, so all have real data
    const avg = performanceTabStats.reduce((acc, p) => acc + p.averagePercentage, 0) / performanceTabStats.length;
    
    // Find most improved student from filtered set
    const studentTrends = performances
      .filter(p => performanceTabStats.some(ps => ps.student.id === p.student.id))
      .map(p => {
        // Use only marks where student actually sat the exam (not absent)
        const sitting = ((p as any).sittingMarks || p.marks.filter((m: any) => !m.absent));
        if (sitting.length < 2) return { id: p.student.id, improvement: 0 };
        const last = (sitting[sitting.length - 1].score / sitting[sitting.length - 1].assessment.maxMarks) * 100;
        const first = (sitting[0].score / sitting[0].assessment.maxMarks) * 100;
        return { id: p.student.id, name: p.student.name, improvement: last - first };
      })
      .sort((a, b) => b.improvement - a.improvement);

    const mostImproved = studentTrends[0]?.improvement > 0 ? studentTrends[0] : null;

    // Highest performing group
    const groupMap: Record<string, { total: number, count: number }> = {};
    performanceTabStats.forEach(p => {
      const key = p.student.groupName || 'General';
      if (!groupMap[key]) groupMap[key] = { total: 0, count: 0 };
      groupMap[key].total += p.averagePercentage;
      groupMap[key].count += 1;
    });
    const bestGroup = Object.entries(groupMap)
      .map(([name, data]) => ({ name, avg: data.total / data.count }))
      .sort((a, b) => b.avg - a.avg)[0];

    return {
      average: avg,
      mostImproved,
      bestGroup
    };
  }, [performanceTabStats, performances]);

  const individualStudentTrendData = useMemo(() => {
    if (selectedStudentForPerformance === 'none') return [];
    
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);
    
    return marks
      .filter(m => m.studentId === selectedStudentForPerformance)
      .map(m => ({
        ...m,
        assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
      }))
      .filter(m => m.assessment && (performanceSubjectFilter === 'all' || m.assessment.subject === performanceSubjectFilter))
      .filter(m => matchesYearFilter(m.assessment.yearGroup, yearFilter))
      .sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime())
      .map(m => ({
        date: new Date(m.assessment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score: (m.score / m.assessment.maxMarks) * 100,
        assessmentName: m.assessment.name,
        subject: m.assessment.subject
      }));
  }, [selectedStudentForPerformance, marks, assessments, performanceSubjectFilter, yearFilter]);

  const subjectTrendData = useMemo(() => {
    const relevantAssessments = assessments
      .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return relevantAssessments.map(assessment => {
      // Only include marks where student actually sat the exam (not absent)
      const assessmentMarks = marks.filter(m => m.assessmentId === assessment.id && !(m as any).absent);
      const avg = assessmentMarks.length > 0
        ? assessmentMarks.reduce((acc, m) => acc + (m.score / assessment.maxMarks) * 100, 0) / assessmentMarks.length
        : 0;
      return {
        date: assessment.date,
        name: assessment.name,
        average: parseFloat(avg.toFixed(1)),
        subject: assessment.subject
      };
    });
  }, [assessments, marks, yearFilter]);

  const groupPerformanceData = useMemo(() => {
    const relevantPerformances = performances.filter(p => 
      matchesYearFilter(p.student.yearGroup, yearFilter) && (p as any).hasData
    );
    const groupMap: Record<string, { total: number, count: number }> = {};
    
    relevantPerformances.forEach(p => {
      const key = p.student.groupName || 'General';
      if (!groupMap[key]) groupMap[key] = { total: 0, count: 0 };
      groupMap[key].total += p.averagePercentage;
      groupMap[key].count += 1;
    });

    return Object.entries(groupMap)
      .map(([group, data]) => ({
        group,
        average: data.total / data.count
      }))
      .sort((a, b) => b.average - a.average);
  }, [performances, yearFilter]);

  const subjectPerformanceData = useMemo(() => {
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);
    const subjects = Array.from(new Set(currentYearAssessments.map(a => a.subject)));
    return subjects.map(subject => {
      const subjectMarks = marks.filter(m => {
        const a = currentYearAssessments.find(as => as.id === m.assessmentId);
        return a?.subject === subject && !(m as any).absent;
      });
      const avg = subjectMarks.length > 0
        ? subjectMarks.reduce((acc, m) => {
            const a = currentYearAssessments.find(as => as.id === m.assessmentId)!;
            return acc + (m.score / a.maxMarks) * 100;
          }, 0) / subjectMarks.length
        : 0;
      return {
        subject,
        average: parseFloat(avg.toFixed(1)),
        count: subjectMarks.length
      };
    });
  }, [assessments, marks, selectedAcademicYear]);

  const classPerformanceData = useMemo(() => {
    const yearGroups: YearGroup[] = [7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'];
    return yearGroups
      .filter(y => matchesYearFilter(y, yearFilter))
      .map(year => {
      const yearPerformances = performances.filter(p => 
        p.student.yearGroup === year && (p as any).hasData
      );
      const avg = yearPerformances.length > 0 
        ? yearPerformances.reduce((acc, p) => acc + p.averagePercentage, 0) / yearPerformances.length 
        : 0;
      return {
        year: typeof year === 'number' ? `Year ${year}` : year,
        average: parseFloat(avg.toFixed(1)),
        count: yearPerformances.length
      };
    }).filter(d => d.count > 0);
  }, [performances]);

  const backupData = () => {
    const data = {
      academicYear: selectedAcademicYear,
      students: students.filter(s => s.academicYear === selectedAcademicYear),
      assessments: assessments.filter(a => a.academicYear === selectedAcademicYear),
      marks: marks.filter(m => {
        const assessment = assessments.find(a => a.id === m.assessmentId);
        return assessment && assessment.academicYear === selectedAcademicYear;
      }),
      groups: groups.filter(g => g.academicYear === selectedAcademicYear),
      yearBoundaries
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `science_tracker_backup_${selectedAcademicYear}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const restoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);
          if (data.students && data.assessments && data.marks) {
            const backupYear = data.academicYear || CURRENT_ACADEMIC_YEAR;
            const currentYearAssessmentIds = new Set(assessments.filter(a => a.academicYear === backupYear).map(a => a.id));
            
            // Filter out existing data for the backup year to avoid duplicates
            setStudents(prev => [
              ...prev.filter(s => s.academicYear !== backupYear),
              ...data.students
            ]);
            setAssessments(prev => [
              ...prev.filter(a => a.academicYear !== backupYear),
              ...data.assessments
            ]);
            setMarks(prev => [
              ...prev.filter(m => !currentYearAssessmentIds.has(m.assessmentId)),
              ...data.marks
            ]);
            
            if (data.groups) {
              setGroups(prev => [
                ...prev.filter(g => g.academicYear !== backupYear),
                ...data.groups
              ]);
            }
            
            if (data.yearBoundaries) setYearBoundaries(data.yearBoundaries);
            
            setSelectedAcademicYear(backupYear);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
          }
        } catch (err) {
          console.error("Restore error:", err);
          alert('Invalid backup file');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleYearTransition = async () => {
    const nextYear = getNextAcademicYear(selectedAcademicYear);
    if (!nextYear) {
      alert("Cannot transition beyond the last supported academic year.");
      return;
    }

    if (!window.confirm(`This will promote all students from ${selectedAcademicYear} to ${nextYear}. Students in Year 13 will be marked as Graduated. Continue?`)) {
      return;
    }

    setSaveStatus('saving');

    const currentStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    const currentGroups = groups.filter(g => g.academicYear === selectedAcademicYear);
    const currentAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

    if (currentStudents.length === 0 && currentGroups.length === 0 && currentAssessments.length === 0) {
      alert(`No students, groups, or assessments found for ${selectedAcademicYear} to promote.`);
      setSaveStatus('idle');
      return;
    }

    const newStudentsList: Student[] = [...students];
    const newGroupsList: Group[] = [...groups];
    const newAssessmentsList: Assessment[] = [...assessments];

    // Promote Groups
    currentGroups.forEach(group => {
      const nextYearGroup = getNextYearGroup(group.yearGroup);
      if (nextYearGroup) {
        const exists = groups.find(g => g.name === group.name && g.yearGroup === nextYearGroup && g.academicYear === nextYear);
        if (!exists) {
          newGroupsList.push({
            id: Math.random().toString(36).substr(2, 9),
            name: group.name,
            yearGroup: nextYearGroup,
            academicYear: nextYear
          });
        }
      }
    });

    // Promote Students
    currentStudents.forEach(student => {
      const nextYearGroup = getNextYearGroup(student.yearGroup);
      if (nextYearGroup) {
        const exists = students.find(s => s.name === student.name && s.yearGroup === nextYearGroup && s.academicYear === nextYear);
        if (!exists) {
          newStudentsList.push({
            id: Math.random().toString(36).substr(2, 9),
            name: student.name,
            yearGroup: nextYearGroup,
            groupName: nextYearGroup === 'Graduated' ? `Class of ${selectedAcademicYear.split('-')[0]}` : student.groupName,
            academicYear: nextYear
          });
        }
      }
    });

    // Promote Assessments (Clone templates to the next year for the same year groups)
    currentAssessments.forEach(assessment => {
      const exists = assessments.find(a => 
        a.name === assessment.name && 
        a.yearGroup === assessment.yearGroup && 
        a.academicYear === nextYear &&
        a.subject === assessment.subject
      );
      if (!exists) {
        // Increment date by 1 year
        let nextDate = assessment.date;
        try {
          const d = new Date(assessment.date);
          d.setFullYear(d.getFullYear() + 1);
          nextDate = d.toISOString().split('T')[0];
        } catch (e) {
          // Fallback to original date if parsing fails
        }

        newAssessmentsList.push({
          ...assessment,
          id: Math.random().toString(36).substr(2, 9),
          academicYear: nextYear,
          date: nextDate
        });
      }
    });

    setStudents(newStudentsList);
    setGroups(newGroupsList);
    setAssessments(newAssessmentsList);
    
    // Update filters to follow the cohort
    const nextYG = getNextYearGroup(yearFilter as YearGroup);
    if (nextYG) setYearFilter(nextYG);
    
    setSelectedAcademicYear(nextYear);
    setSaveStatus('saved');
    alert(`Successfully promoted ${currentStudents.length} students, ${currentGroups.length} groups, and ${currentAssessments.length} assessment templates to ${nextYear}.`);
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  const handlePaperUpload = async (e: React.ChangeEvent<HTMLInputElement>, assessmentId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const prompt = extractionMode === 'subparts' 
        ? "Extract all question numbers (including sub-parts like 1a, 1b, etc.) and their maximum marks from this exam paper. Return the data as a JSON array of objects with 'number' (string) and 'maxMarks' (number) properties. Ensure the total of maxMarks matches the overall paper total if specified."
        : "Extract only the main question numbers (1, 2, 3, etc.) and their total maximum marks for each question from this exam paper. Return the data as a JSON array of objects with 'number' (string) and 'maxMarks' (number) properties. Ensure the total of maxMarks matches the overall paper total if specified.";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.STRING },
                maxMarks: { type: Type.NUMBER },
              },
              required: ["number", "maxMarks"],
            },
          },
        },
      });

      const extractedQuestions: Question[] = JSON.parse(response.text || '[]');
      
      if (extractedQuestions.length === 0) {
        throw new Error("No questions could be extracted from the paper. Please ensure the file is clear and contains question numbers and marks.");
      }

      const totalMaxMarks = extractedQuestions.reduce((sum, q) => sum + q.maxMarks, 0);

      // Update assessment in Firestore
      await updateDoc(doc(db, 'assessments', assessmentId), {
        questions: extractedQuestions,
        maxMarks: totalMaxMarks
      });

      // Update local state
      setAssessments(prev => prev.map(a => 
        a.id === assessmentId ? { ...a, questions: extractedQuestions, maxMarks: totalMaxMarks } : a
      ));

      setIsExtracting(false);
    } catch (error: any) {
      console.error("Extraction error:", error);
      setExtractionError(error.message || "Failed to extract questions. Please try again with a clearer file.");
      setIsExtracting(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (confirm('Are you sure you want to delete this student and all their marks?')) {
      try {
        setSaveStatus('saving');
        const studentMarks = marks.filter(m => m.studentId === studentId);
        await Promise.all([
          deleteDoc(doc(db, 'students', studentId)),
          ...studentMarks.map(m => deleteDoc(doc(db, 'marks', m.id)))
        ]);
        
        setStudents(prev => prev.filter(s => s.id !== studentId));
        setMarks(prev => prev.filter(m => m.studentId !== studentId));
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Failed to delete student:", error);
        setSaveStatus('idle');
      }
    }
  };

  const handleDeleteClass = async (year: YearGroup, groupName: string) => {
    if (confirm(`Are you sure you want to delete all students and data in ${groupName} (Year ${year})?`)) {
      try {
        setSaveStatus('saving');
        const studentsToDelete = students.filter(s => 
          String(s.yearGroup) === String(year) && 
          s.groupName === groupName && 
          s.academicYear === selectedAcademicYear
        );
        const studentIds = new Set(studentsToDelete.map(s => s.id));
        const marksToDelete = marks.filter(m => studentIds.has(m.studentId));
        const groupToDelete = groups.find(g => g.name === groupName && g.yearGroup === year && g.academicYear === selectedAcademicYear);
        
        const deletePromises = [
          ...studentsToDelete.map(s => deleteDoc(doc(db, 'students', s.id))),
          ...marksToDelete.map(m => deleteDoc(doc(db, 'marks', m.id)))
        ];
        
        if (groupToDelete) {
          deletePromises.push(deleteDoc(doc(db, 'groups', groupToDelete.id)));
        }
        
        await Promise.all(deletePromises);
        
        setStudents(prev => prev.filter(s => !studentIds.has(s.id)));
        setMarks(prev => prev.filter(m => !studentIds.has(m.studentId)));
        if (groupToDelete) {
          setGroups(prev => prev.filter(g => g.id !== groupToDelete.id));
        }
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Failed to delete class:", error);
        setSaveStatus('idle');
      }
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (confirm('Are you sure you want to delete this assessment and all associated marks?')) {
      try {
        setSaveStatus('saving');
        const assessmentMarks = marks.filter(m => m.assessmentId === assessmentId);
        await Promise.all([
          deleteDoc(doc(db, 'assessments', assessmentId)),
          ...assessmentMarks.map(m => deleteDoc(doc(db, 'marks', m.id)))
        ]);
        
        setAssessments(prev => prev.filter(a => a.id !== assessmentId));
        setMarks(prev => prev.filter(m => m.assessmentId !== assessmentId));
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Failed to delete assessment:", error);
        setSaveStatus('idle');
      }
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (confirm('Are you sure you want to delete this group? Students will remain but will be unassigned from this group.')) {
      try {
        setSaveStatus('saving');
        const group = groups.find(g => g.id === groupId);
        if (group) {
          await deleteDoc(doc(db, 'groups', groupId));
          setGroups(prev => prev.filter(g => g.id !== groupId));
          
          // Clear groupName for students in this group
          const studentsToUpdate = students.filter(s => s.groupName === group.name && String(s.yearGroup) === String(group.yearGroup) && s.academicYear === group.academicYear);
          await Promise.all(studentsToUpdate.map(s => updateDoc(doc(db, 'students', s.id), { groupName: '' })));
          setStudents(prev => prev.map(s => studentsToUpdate.find(stu => stu.id === s.id) ? { ...s, groupName: '' } : s));
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Failed to delete group:", error);
        setSaveStatus('idle');
      }
    }
  };

  const handleBulkStudentImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    const processData = (data: any[][], sheetName?: string) => {
      // Find header row index (row containing 'Surname', 'Last Name', 'Forename', or 'First Name')
      const headerIndex = data.findIndex(row => 
        row.some(cell => {
          if (typeof cell !== 'string') return false;
          const c = cell.toLowerCase();
          return c.includes('surname') || c.includes('last name') || c.includes('forename') || c.includes('first name');
        })
      );
      
      if (headerIndex === -1) {
        return []; // No valid data in this sheet
      }

      const headers = data[headerIndex];
      const dataRows = data.slice(headerIndex + 1);
      
      // Try to guess group name from sheet name or first row
      let guessedGroup = sheetName || '';
      if (!guessedGroup && data[0] && typeof data[0][0] === 'string') {
        const firstCell = data[0][0];
        const match = firstCell.match(/^([^\s-]+)/);
        if (match) guessedGroup = match[0];
      }

      // Map column indices
      const surnameIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('surname') || c.includes('last name');
      });
      const forenameIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('forename') || c.includes('first name');
      });
      const yearIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('year');
      });
      const groupIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('group') || c.includes('class');
      });
      const subjectsIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('subject');
      });
      const levelsIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('level');
      });
      
      const normalizeYearGroup = (val: any): YearGroup => {
        if (!val) return 7;
        const s = String(val).trim();
        const num = parseInt(s);
        // Check explicit IGCSE/IB strings first
        if (s.toLowerCase().includes('igcse') || num === 10 || num === 11) {
          if (num === 11 || s.includes('11')) return '11 IGCSE';
          return '10 IGCSE';
        }
        if (s.toLowerCase().includes('ib') || num === 12 || num === 13) {
          if (num === 13 || s.includes('13')) return '13 IB';
          return '12 IB';
        }
        if (num === 7 || s === '7') return 7;
        if (num === 8 || s === '8') return 8;
        if (num === 9 || s === '9') return 9;
        // For plain numeric strings like "10 IGCSE", "11 IGCSE" — extract leading number
        const match = s.match(/^(\d+)/);
        if (match) {
          const n = parseInt(match[1]);
          if (n === 7) return 7;
          if (n === 8) return 8;
          if (n === 9) return 9;
          if (n === 10) return '10 IGCSE';
          if (n === 11) return '11 IGCSE';
          if (n === 12) return '12 IB';
          if (n === 13) return '13 IB';
        }
        return 7;
      };

      return dataRows.map(row => {
        const yearGroup = normalizeYearGroup(row[yearIdx]);
        // Parse subjects: if column exists use it, else auto-assign all subjects for the year
        let subjects: string[] = SUBJECTS_BY_YEAR[yearGroup] || [];
        if (subjectsIdx !== -1 && row[subjectsIdx]) {
          // Support comma-separated subjects e.g. "Physics, Chemistry" or "Biology"
          const rawSubjects = String(row[subjectsIdx]).split(',').map((s: string) => s.trim()).filter(Boolean);
          // Normalise to match exact subject names (case-insensitive)
          const allSubjectsForYear = SUBJECTS_BY_YEAR[yearGroup] || [];
          subjects = rawSubjects.map((rs: string) => {
            const match = allSubjectsForYear.find(s => s.toLowerCase() === rs.toLowerCase());
            return match || rs; // use matched name or keep as-is
          });
        }
        // Parse HL/SL levels — comma-separated in same order as subjects
        let subjectLevels: Record<string, string> = {};
        if (levelsIdx !== -1 && row[levelsIdx] && subjects.length > 0) {
          const rawLevels = String(row[levelsIdx]).split(',').map((l: string) => l.trim().toUpperCase());
          subjects.forEach((subj: string, i: number) => {
            const level = rawLevels[i];
            if (level === 'HL' || level === 'SL') subjectLevels[subj] = level;
          });
        }
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: `${row[forenameIdx] || ''} ${row[surnameIdx] || ''}`.trim(),
          yearGroup,
          groupName: (groupIdx !== -1 ? String(row[groupIdx] || '') : guessedGroup) || '',
          academicYear: selectedAcademicYear,
          subjects,
          ...(Object.keys(subjectLevels).length > 0 && { subjectLevels })
        };
      }).filter(s => s.name !== '' && s.name !== ' ');
    };

    const finalizeImport = (newStudents: any[]) => {
      const existingStudentKeys = new Set(students.map(s => `${s.name.toLowerCase()}|${s.groupName.toLowerCase()}`));
      
      const toAdd: Student[] = [];
      let duplicateCount = 0;
      const seenInImport = new Set<string>();

      newStudents.forEach(s => {
        const key = `${s.name.toLowerCase()}|${s.groupName.toLowerCase()}`;
        if (existingStudentKeys.has(key) || seenInImport.has(key)) {
          duplicateCount++;
        } else {
          toAdd.push(s);
          seenInImport.add(key);
        }
      });

      if (toAdd.length > 0) {
        setStudents(prev => [...prev, ...toAdd]);
        
        // Auto-create group entries for any new groups discovered
        const newGroupEntries: Group[] = [];
        const groupKeys = new Set(groups.map(g => `${String(g.yearGroup)}|${g.name}|${g.academicYear}`));
        
        toAdd.forEach(s => {
          if (!s.groupName) return;
          const key = `${String(s.yearGroup)}|${s.groupName}|${s.academicYear}`;
          if (!groupKeys.has(key)) {
            newGroupEntries.push({
              id: Math.random().toString(36).substr(2, 9),
              yearGroup: s.yearGroup,
              name: s.groupName,
              academicYear: s.academicYear
            });
            groupKeys.add(key);
          }
        });
        
        if (newGroupEntries.length > 0) {
          setGroups(prev => [...prev, ...newGroupEntries]);
        }
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }

      if (duplicateCount > 0) {
        alert(`${duplicateCount} duplicate students were found and skipped (same name and group).`);
      }
    };

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        
        const allStudents: Student[] = [];
        wb.SheetNames.forEach(wsname => {
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          allStudents.push(...processData(jsonData, wsname));
        });

        finalizeImport(allStudents);
        e.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const allStudents = processData(results.data as any[][]);
          finalizeImport(allStudents);
          e.target.value = '';
        }
      });
    }
  };

  const updateQuestionScore = (studentId: string, assessmentId: string, questionNumber: string, score: number) => {
    setMarks(prev => {
      const existingMark = prev.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
      
      if (existingMark) {
        const newQuestionScores: Record<string, number> = { 
          ...(existingMark.questionScores || {}), 
          [questionNumber]: score 
        };
        const newTotalScore = Object.values(newQuestionScores).reduce((sum: number, s: number) => sum + s, 0);
        
        return prev.map(m => 
          (m.studentId === studentId && m.assessmentId === assessmentId)
            ? { ...m, questionScores: newQuestionScores, score: newTotalScore }
            : m
        );
      } else {
        const newQuestionScores: Record<string, number> = { [questionNumber]: score };
        return [...prev, { 
          id: Math.random().toString(36).substr(2, 9),
          studentId, 
          assessmentId, 
          questionScores: newQuestionScores, 
          score 
        }];
      }
    });
  };

  const downloadStudentTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Students ───────────────────────────────────────────────────
    const studentData = [
      ['Surname', 'First Name', 'Preferred Name', 'Year', 'Group'],
      ['Ahmed',   'Sarah',      'Sarah',          '7',    '7W'],
      ['Brown',   'James',      'Jim',            '10',   '10A'],
      ['Clarke',  'Emma',       'Emma',           '12',   '12B'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(studentData);
    ws1['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Students');

    // ── Sheet 2: Instructions ────────────────────────────────────────────────
    const instructions = [
      ['STUDENT LIST UPLOAD — INSTRUCTIONS'],
      [''],
      ['Fill in one row per student.'],
      [''],
      ['COLUMN GUIDE'],
      ['Surname',        'Student family name'],
      ['First Name',     'Student legal first name'],
      ['Preferred Name', 'Name the student prefers to be called'],
      ['Year',           'Year group (e.g. 7, 8, 9, 10, 11, 12, 13)'],
      ['Group',          'Class code e.g. 7W, 10A, 12B'],
      [''],
      ['TIPS'],
      ['• Delete the example rows before uploading.'],
      ['• Year 10/11 will be treated as IGCSE, Year 12/13 as IB.'],
      ['• Group names are case-sensitive.'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructions);
    ws2['!cols'] = [{ wch: 20 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    XLSX.writeFile(wb, 'Student_List_Template.xlsx');
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Assessment Marks ─────────────────────
    const headers = ['Surname', 'First Name', 'Preferred Name', 'Year Group', 'Group', 'Subject', 'Assessment Name', 'Score', 'Max Marks', 'Date'];
    const data = [
      headers,
      ['Ahmed',  'Sarah', 'Sarah', '7', '7W', 'Computer Science', 'Unit Test 1', 38, 50, '2024-01-15'],
      ['Brown',  'James', 'Jim',   '7', '7W', 'Computer Science', 'Unit Test 1', 40, 50, '2024-01-15'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    ws1['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Marks');

    // ── Sheet 2: Instructions ────────────────────────────────────────────────
    const instructions = [
      ['ASSESSMENT MARKS UPLOAD — INSTRUCTIONS'],
      [''],
      ['HOW TO USE THIS TEMPLATE'],
      ['1.', 'Fill in one row per student per assessment.'],
      ['2.', 'Surname, First Name, and Year Group are required.'],
      ['3.', 'Assessment Name, Score, and Max Marks are used to record results.'],
      [''],
      ['COLUMN GUIDE'],
      ['Surname',        'Student family name'],
      ['First Name',     'Student legal first name'],
      ['Preferred Name', 'Optional. Name the student prefers'],
      ['Year Group',     '7, 8, 9, 10, 11, 12, 13'],
      ['Group',          'Class code e.g. 7W, 10A'],
      ['Subject',        'e.g. Computer Science'],
      ['Assessment Name','Name of the test/exam'],
      ['Score',          'The mark achieved'],
      ['Max Marks',      'Total possible marks'],
      ['Date',           'YYYY-MM-DD format'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructions);
    ws2['!cols'] = [{ wch: 22 }, { wch: 75 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    XLSX.writeFile(wb, 'Assessment_Marks_Template.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const allData: any[] = [];
    let fileName = files[0].name.replace(/\.[^/.]+$/, "");
    if (files.length > 1) fileName = "Multiple Files";

    const processData = (data: any[], sheetName?: string) => {
      if (data.length === 0) return;

      const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
      const metadataHeaders = [
        'studentname', 'name', 'student', 'yeargroup', 'year', 'groupname', 'group', 'class', 'subject', 'date', 'maxmarks', 'assessmentname', 'score', 'mark',
        'upn', 'uln', 'gender', 'dob', 'sen', 'pp', 'fsm', 'eal', 'ethnicity', 'notes', 'comments', 'attendance', 'email', 'id', 'mis_id', '__sheetname'
      ].map(h => h.toLowerCase().replace(/[\s_]/g, ''));

      const hasAssessmentNameColumn = headers.some(h => h.toLowerCase().replace(/[\s_]/g, '') === 'assessmentname');
      
      const extraColumns = headers.filter(h => {
        if (metadataHeaders.includes(h.toLowerCase().replace(/[\s_]/g, ''))) return false;
        
        return data.some((row: any) => {
          const val = row[h];
          return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
        });
      });
      
      setPendingImport({ data, fileName, sheetName });
      
      let guessedYear: YearGroup = 7;
      const yearMatch = fileName.match(/\b(7|8|9|10|11|12|13)\b/i);
      if (yearMatch) {
        const num = parseInt(yearMatch[0]);
        if (num === 10 || num === 11) guessedYear = `${num} IGCSE` as YearGroup;
        else if (num === 12 || num === 13) guessedYear = `${num} IB` as YearGroup;
        else guessedYear = num as YearGroup;
      }
      if (fileName.toLowerCase().includes('igcse')) {
        if (fileName.includes('10')) guessedYear = '10 IGCSE';
        else if (fileName.includes('11')) guessedYear = '11 IGCSE';
      } else if (fileName.toLowerCase().includes('ib')) {
        if (fileName.includes('12')) guessedYear = '12 IB';
        else if (fileName.includes('13')) guessedYear = '13 IB';
      }
      
      setImportConfig({
        yearGroup: (yearFilter === 'all' || yearFilter === 'IGCSE_ALL' || yearFilter === 'IB_ALL') ? guessedYear : yearFilter,
        groupName: fileName,
        assessmentName: hasAssessmentNameColumn ? 'Multiple (from File)' : (extraColumns.length > 0 ? 'Multiple Columns' : 'New Assessment'),
        subject: SUBJECTS_BY_YEAR[(yearFilter === 'all' || yearFilter === 'IGCSE_ALL' || yearFilter === 'IB_ALL') ? guessedYear : yearFilter][0],
        maxMarks: 100,
        date: new Date().toISOString().split('T')[0]
      });
      
      setImportPreview(null);
      setImportColumnSubjects({});
      setShowImportModal(true);
      e.target.value = '';
    };

    for (const file of files) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const data = await new Promise<ArrayBuffer>((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as ArrayBuffer);
          reader.readAsArrayBuffer(file);
        });
        const wb = XLSX.read(data, { type: 'array' });
        wb.SheetNames.forEach(wsname => {
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { defval: null });
          if (jsonData.length > 0) {
            jsonData.forEach((row: any) => {
              row.__sheetName = wsname;
            });
            allData.push(...jsonData);
          }
        });
      } else {
        const data = await new Promise<any[]>((resolve) => {
          Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
              const rawData = results.data as any[][];
              const headerIndex = rawData.findIndex(row => 
                row.some(cell => {
                  if (typeof cell !== 'string') return false;
                  const c = cell.toLowerCase();
                  return c.includes('surname') || c.includes('forename') || c.includes('student');
                })
              );
              
              if (headerIndex === -1) {
                resolve([]);
                return;
              }

              const headers = rawData[headerIndex];
              const dataRows = rawData.slice(headerIndex + 1);
              
              const result = dataRows.map(row => {
                const obj: any = {};
                headers.forEach((h, i) => {
                  obj[h] = row[i];
                });
                return obj;
              });
              resolve(result);
            }
          });
        });
        allData.push(...data);
      }
    }
    processData(allData, fileName);
  };

  const confirmImport = () => {
    if (!pendingImport) return;

    const { data, sheetName: defaultSheetName } = pendingImport;
    const { yearGroup, groupName, assessmentName: defaultAssessmentName, subject: defaultSubject, maxMarks: defaultMaxMarks, date: defaultDate } = importConfig;

    const newMarks: Mark[] = [...marks];
    const newStudents: Student[] = [...students];
    const newAssessments: Assessment[] = [...assessments];
    const newGroups: Group[] = [...groups];

    // Ensure group exists
    let group = newGroups.find(g => g.name === groupName && g.yearGroup === yearGroup && g.academicYear === selectedAcademicYear);
    if (!group) {
      group = {
        id: Math.random().toString(36).substr(2, 9),
        yearGroup,
        name: groupName,
        academicYear: selectedAcademicYear
      };
      newGroups.push(group);
    }

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_]/g, '');
    const findValue = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      const normalizedPossible = possibleKeys.map(k => normalizeKey(k));
      const foundKey = rowKeys.find(rk => normalizedPossible.includes(normalizeKey(rk)));
      return foundKey ? row[foundKey] : undefined;
    };

    // Helper: normalise level value to 'HL' | 'SL' | undefined
    const normalizeLevel = (val: any): 'HL' | 'SL' | undefined => {
      if (!val) return undefined;
      const s = String(val).trim().toUpperCase();
      if (s === 'HL' || s === 'HIGHER' || s === 'HIGHER LEVEL') return 'HL';
      if (s === 'SL' || s === 'STANDARD' || s === 'STANDARD LEVEL') return 'SL';
      return undefined;
    };

    // Normalise a subject string to match SUBJECTS_BY_YEAR keys (case-insensitive)
    const normalizeSubjectName = (raw: string): string => {
      const allSubjects = ['Computer Science'];
      const match = allSubjects.find(s => s.toLowerCase() === raw.trim().toLowerCase());
      return match || raw.trim();
    };

    const extractInfo = (header: string, rowData?: any, sheetName?: string) => {
      let name = header;
      let maxMarks = defaultMaxMarks;
      let subjectFromHeader: string | undefined;

      // 1. Extract max marks from header: "Topic 1 (29)" or "Topic 1(29)"
      const marksMatch = header.match(/\((\d+)\)/);
      if (marksMatch) {
        maxMarks = parseInt(marksMatch[1]);
        name = header.replace(marksMatch[0], '').trim();
      }

      // 2. Extract subject from header if present after a dash:
      //    "Programming - Computer Science" → name=Programming, subject=Computer Science
      //    "Topic 3 Data - Physics"         → name=Topic 3 Data, subject=Physics
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        const possibleSubject = dashMatch[2].trim();
        const allSubjects = ['Computer Science'];
        const isKnownSubject = allSubjects.some(s => s.toLowerCase() === possibleSubject.toLowerCase());
        if (isKnownSubject) {
          name = dashMatch[1].trim();
          subjectFromHeader = normalizeSubjectName(possibleSubject);
        }
      }

      // 3. Check for sub-header in the first row of data
      if (rowData && rowData[header]) {
        const subVal = String(rowData[header]);
        const subMarksMatch = subVal.match(/\((\d+)\)/);
        if (subMarksMatch) {
          maxMarks = parseInt(subMarksMatch[1]);
          if (name.startsWith('__EMPTY') || !name || name.toLowerCase() === 'score' || name.toLowerCase() === 'mark') {
            name = subVal.replace(subMarksMatch[0], '').trim() || name;
          }
        }
      }

      // 4. Handle __EMPTY or generic names
      if (name.startsWith('__EMPTY') || !name || name.toLowerCase() === 'score' || name.toLowerCase() === 'mark') {
        name = sheetName || 'Test Topic';
      }

      return { name, maxMarks, subjectFromHeader };
    };

    const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
    const metadataHeaders = [
      'studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname',
      'surname', 'lastname', 'forename', 'firstname',
      'yeargroup', 'year', 'groupname', 'group', 'class',
      'subject', 'subjects', 'level', 'iblevel', 'date', 'maxmarks', 'assessmentname', 'score', 'mark', 'isnew', 'newstudent', 'latejoined',
      'upn', 'uln', 'gender', 'dob', 'sen', 'pp', 'fsm', 'eal', 'ethnicity', 'notes', 'comments', 'attendance', 'email', 'id', 'mis_id', '__sheetname', '__empty'
    ].map(h => normalizeKey(h));

    const hasAssessmentNameColumn = headers.some(h => normalizeKey(h) === 'assessmentname');
    const scoreColumns: string[] = headers.filter(h => {
      if (metadataHeaders.includes(normalizeKey(h))) return false;
      return data.some((row: any) => {
        const val = row[h];
        return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
      });
    });

    // Check if the first row is a sub-header (contains marks in parentheses)
    const firstRow = data[0];
    const isFirstRowSubHeader = firstRow && scoreColumns.some(col => String(firstRow[col]).includes('('));
    const dataToProcess = isFirstRowSubHeader ? data.slice(1) : data;

    dataToProcess.forEach((row: any) => {
      // Support both "Student Name" single column and "Surname" + "First Name" split columns
      let studentNameRaw = findValue(row, ['studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname']);
      if (!studentNameRaw) {
        const surname = findValue(row, ['surname', 'lastname', 'last name', 'familyname']);
        const forename = findValue(row, ['forename', 'firstname', 'first name', 'givenname', 'forename']);
        if (surname || forename) {
          studentNameRaw = `${String(forename || '').trim()} ${String(surname || '').trim()}`.trim();
        }
      }
      if (!studentNameRaw) return;
      const studentName = String(studentNameRaw).trim();
      const preferredName = findValue(row, ['preferredname', 'preferred name', 'nickname']) || '';
      const isNewRaw = findValue(row, ['isnew', 'newstudent', 'new', 'latejoined']);
      const isNew = isNewRaw !== undefined ? (String(isNewRaw).toLowerCase() === 'true' || String(isNewRaw).toLowerCase() === 'yes' || isNewRaw === 1 || String(isNewRaw).toLowerCase() === 'y') : false;
      const notesRaw = findValue(row, ['notes', 'comments', 'details', 'studentdetails']);
      const studentNotes = notesRaw ? String(notesRaw).trim() : '';

      const rowSheetName = row.__sheetName || defaultSheetName;

      // Derive the year group: prefer the import config (set by user in the modal),
      // but also accept the per-row Year Group cell as a cross-check.
      // If the row's Year Group cell disagrees with the import config, trust the import config —
      // this protects against data-entry errors like "11 IGCSE", "12 IGCSE" appearing in a 10R sheet.
      const rowYearGroupRaw = findValue(row, ['yeargroup', 'year group', 'year']);
      const rowYearGroup = (() => {
        if (!rowYearGroupRaw) return yearGroup;
        const s = String(rowYearGroupRaw).trim().toLowerCase();
        if (s.includes('10')) return '10 IGCSE' as YearGroup;
        if (s.includes('11')) return '11 IGCSE' as YearGroup;
        if (s.includes('12')) return '12 IB' as YearGroup;
        if (s.includes('13')) return '13 IB' as YearGroup;
        if (s.includes('7')) return 7 as YearGroup;
        if (s.includes('8')) return 8 as YearGroup;
        if (s.includes('9')) return 9 as YearGroup;
        return yearGroup;
      })();
      // If row says a different year from import config, trust import config (handles data entry errors)
      let effectiveYearGroup = String(rowYearGroup) === String(yearGroup) ? yearGroup : yearGroup;

      // Read per-row subject and level (overrides the import config defaults for this row)
      const rowSubjectOverride = findValue(row, ['subject', 'subjects']);
      const rowLevel = normalizeLevel(findValue(row, ['level', 'ib level', 'iblevel']));

      // Determine group name with this priority:
      // 1. The 'Group' or 'Class' column in the row data (most explicit — e.g. '10R', '10S', '7W')
      // 2. The sheet name (set as __sheetName on every row for Excel imports)
      // 3. The importConfig groupName (filename fallback for CSV imports)
      const rowGroupCol = findValue(row, ['group', 'class', 'groupname']);
      console.log('DEBUG: row keys:', Object.keys(row));
      console.log('DEBUG: row:', row, 'rowGroupCol:', rowGroupCol);
      const rowGroupName = rowGroupCol ? String(rowGroupCol).trim() : null;
      const effectiveGroupName = rowGroupName || rowSheetName || groupName;
      console.log('DEBUG: effectiveGroupName:', effectiveGroupName);

      // Derive year group from group name if possible (e.g., "10R" -> "10 IGCSE")
      if (effectiveGroupName) {
        const match = effectiveGroupName.match(/^(\d+)/);
        if (match) {
          const yearNum = parseInt(match[1]);
          if (yearNum === 10) effectiveYearGroup = '10 IGCSE';
          else if (yearNum === 11) effectiveYearGroup = '11 IGCSE';
          else if (yearNum === 12) effectiveYearGroup = '12 IB';
          else if (yearNum === 13) effectiveYearGroup = '13 IB';
          else if (yearNum >= 7 && yearNum <= 9) effectiveYearGroup = yearNum as YearGroup;
        }
      }

      // Also ensure group record exists for this effectiveGroupName
      if (effectiveGroupName) {
        const gKey = `${String(effectiveYearGroup)}|${effectiveGroupName}|${selectedAcademicYear}`;
        const groupKeys = new Set(newGroups.map(g => `${String(g.yearGroup)}|${g.name}|${g.academicYear}`));
        if (!groupKeys.has(gKey)) {
          newGroups.push({
            id: Math.random().toString(36).substr(2, 9),
            yearGroup: effectiveYearGroup,
            name: effectiveGroupName,
            academicYear: selectedAcademicYear
          });
        }
      }

      // Ensure student exists
      let student = newStudents.find(s => s.name.trim().toLowerCase() === studentName.toLowerCase() && s.yearGroup === effectiveYearGroup && s.academicYear === selectedAcademicYear);
      if (!student) {
        student = { 
          id: Math.random().toString(36).substr(2, 9), 
          name: studentName, 
          preferredName: String(preferredName).trim(),
          yearGroup: effectiveYearGroup,
          groupName: effectiveGroupName,
          academicYear: selectedAcademicYear,
          isNew: isNew,
          notes: studentNotes
        } as any;
        newStudents.push(student);
      } else {
        if (student.groupName !== effectiveGroupName) {
          student.groupName = effectiveGroupName;
        }
        if (preferredName) {
          student.preferredName = String(preferredName).trim();
        }
        if (isNewRaw !== undefined) {
          student.isNew = isNew;
        }
        if (studentNotes) {
          student.notes = studentNotes;
        }
      }

      // Store subject level on student if provided (e.g. Physics: HL)
      if (rowSubjectOverride && rowLevel) {
        const subjectKey = rowSubjectOverride.trim();
        const existing = (student as any).subjectLevels || {};
        (student as any).subjectLevels = { ...existing, [subjectKey]: rowLevel };
      }

      // Update subjects list on student from this row's subject
      if (rowSubjectOverride) {
        const subj = rowSubjectOverride.trim();
        const existingSubjects: string[] = (student as any).subjects || [];
        if (!existingSubjects.includes(subj)) {
          (student as any).subjects = [...existingSubjects, subj];
        }
      }

      if (hasAssessmentNameColumn) {
        // Row-based assessments
        const rowAssessmentName = findValue(row, ['assessmentname']) || defaultAssessmentName;
        const rowSubject = findValue(row, ['subject']) || defaultSubject;
        const rowMaxMarks = parseFloat(findValue(row, ['maxmarks'])) || defaultMaxMarks;
        const rowDate = findValue(row, ['date']) || defaultDate;
        const rowScoreRaw = parseFloat(findValue(row, ['score', 'mark'])) || 0;
        const rowScore = Math.min(rowMaxMarks, Math.max(0, rowScoreRaw));

        let assessment = newAssessments.find(a => a.name.trim().toLowerCase() === rowAssessmentName.trim().toLowerCase() && a.yearGroup === yearGroup && a.subject === rowSubject && a.academicYear === selectedAcademicYear);
        if (!assessment) {
          assessment = {
            id: Math.random().toString(36).substr(2, 9),
            name: rowAssessmentName,
            subject: rowSubject,
            maxMarks: rowMaxMarks,
            date: rowDate,
            yearGroup,
            academicYear: selectedAcademicYear
          };
          newAssessments.push(assessment);
        }

        const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
        if (existingMarkIdx !== -1) {
          newMarks[existingMarkIdx].score = rowScore;
        } else {
          newMarks.push({ 
            id: Math.random().toString(36).substr(2, 9),
            studentId: student!.id, 
            assessmentId: assessment.id, 
            score: rowScore 
          });
        }
      } else if (scoreColumns.length > 0) {
        // Column-based assessments
        scoreColumns.forEach(col => {
          if (row[col] === undefined || row[col] === null || row[col] === '') return;
          
          const rawVal = String(row[col]).trim();
          
          // Detect explicit absent markers
          const isAbsent = /^(absent|abs|a\/a|n\/a|na|-)$/i.test(rawVal);
          
          // Skip non-numeric, non-absent values (e.g. "new", "tbd")
          if (!isAbsent && isNaN(parseFloat(rawVal))) return;

          const rowScoreRaw = isAbsent ? 0 : parseFloat(rawVal);
          const { name: rowAssessmentName, maxMarks: rowMaxMarks, subjectFromHeader } = extractInfo(col, isFirstRowSubHeader ? firstRow : null, rowSheetName);
          const rowScore = isAbsent ? 0 : Math.min(rowMaxMarks, Math.max(0, rowScoreRaw));
          // Subject priority: 1) encoded in column header ("Assessment - Physics (35)")
          //                   2) per-row Subject/Subjects column (only if single subject)
          //                   3) import config default
          const rowSubjectRaw = rowSubjectOverride ? rowSubjectOverride.trim() : defaultSubject;
          const subjectsAreMultiple = rowSubjectRaw.includes(',');
          // Subject priority:
          // 1. Encoded in column header: "Programming - Computer Science(35)"
          // 2. User assigned per-column in the import preview UI (importColumnSubjects)
          // 3. Per-row Subject column (only if single subject, not comma-separated list)
          // 4. Global import config subject (fallback)
          const rowSubject = subjectFromHeader 
            || importColumnSubjects[col]
            || (subjectsAreMultiple ? defaultSubject : rowSubjectRaw);
          const rowDate = defaultDate;

          // Match assessment: name + subject + yearGroup + academicYear
          // Use String() comparison to handle type mismatches
          let assessment = newAssessments.find(a => 
            a.name.trim().toLowerCase() === rowAssessmentName.trim().toLowerCase() && 
            String(a.yearGroup) === String(yearGroup) && 
            a.subject === rowSubject && 
            a.academicYear === selectedAcademicYear
          );
          if (!assessment) {
            assessment = {
              id: Math.random().toString(36).substr(2, 9),
              name: rowAssessmentName,
              subject: rowSubject,
              maxMarks: rowMaxMarks,
              date: rowDate,
              yearGroup,
              academicYear: selectedAcademicYear
            };
            newAssessments.push(assessment);
          } else {
            // Update maxMarks if the header specifies a different value
            if (rowMaxMarks !== defaultMaxMarks) {
              assessment.maxMarks = rowMaxMarks;
            }
          }

          // Update existing mark or add new one; handle absent flag
          const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
          if (existingMarkIdx !== -1) {
            if (isAbsent) {
              (newMarks[existingMarkIdx] as any).absent = true;
              newMarks[existingMarkIdx].score = 0;
            } else {
              newMarks[existingMarkIdx].score = rowScore;
              delete (newMarks[existingMarkIdx] as any).absent;
            }
          } else {
            newMarks.push(isAbsent
              ? { id: Math.random().toString(36).substr(2, 9), studentId: student!.id, assessmentId: assessment.id, score: 0, absent: true } as any
              : { id: Math.random().toString(36).substr(2, 9), studentId: student!.id, assessmentId: assessment.id, score: rowScore }
            );
          }
        });
      } else {
        // Single assessment fallback
        const rowScoreRaw = parseFloat(findValue(row, ['score', 'mark'])) || 0;
        const rowScore = Math.min(defaultMaxMarks, Math.max(0, rowScoreRaw));
        let assessment = newAssessments.find(a => a.name.trim().toLowerCase() === defaultAssessmentName.trim().toLowerCase() && a.yearGroup === yearGroup && a.academicYear === selectedAcademicYear);
        if (!assessment) {
          assessment = { 
            id: Math.random().toString(36).substr(2, 9), 
            name: defaultAssessmentName, 
            subject: defaultSubject, 
            maxMarks: defaultMaxMarks,
            date: defaultDate,
            yearGroup,
            academicYear: selectedAcademicYear
          };
          newAssessments.push(assessment);
        }

        const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
        if (existingMarkIdx !== -1) {
          newMarks[existingMarkIdx].score = rowScore;
        } else {
          newMarks.push({ 
            id: Math.random().toString(36).substr(2, 9),
            studentId: student!.id, 
            assessmentId: assessment.id, 
            score: rowScore 
          });
        }
      }
    });

    setGroups(newGroups);
    setStudents(newStudents);
    setAssessments(newAssessments);
    setMarks(newMarks);
    
    const newStudentCount = newStudents.length - students.length;
    const newAssessmentCount = newAssessments.length - assessments.length;
    const newMarkCount = newMarks.length - marks.length;
    
    setShowImportModal(false);
    setPendingImport(null);
    setImportPreview(null);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 3000);

    // Show summary alert
    const parts = [];
    if (newStudentCount > 0) parts.push(`${newStudentCount} new student${newStudentCount > 1 ? 's' : ''}`);
    if (newAssessmentCount > 0) parts.push(`${newAssessmentCount} new assessment${newAssessmentCount > 1 ? 's' : ''}`);
    if (newMarkCount > 0) parts.push(`${newMarkCount} mark${newMarkCount > 1 ? 's' : ''} added/updated`);
    if (parts.length > 0) {
      alert('Import complete: ' + parts.join(', ') + '.');
    } else {
      alert('Import complete — no new data detected. Check that student names match exactly and column headers include max marks e.g. "Test 1 (50)".');
    }
  };

  // Dry-run the import to show a preview of what will be created/updated
  const previewImport = () => {
    if (!pendingImport) return;
    const { data } = pendingImport;
    const { yearGroup, subject: defaultSubject, maxMarks: defaultMaxMarks } = importConfig;

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_]/g, '');
    const metadataKeys = [
      'studentname','name','student','fullname','pupil','pupilname',
      'surname','lastname','forename','firstname',
      'yeargroup','year','groupname','group','class',
      'subject','subjects','level','iblevel','date','maxmarks','assessmentname','score','mark',
      'upn','uln','gender','dob','sen','pp','fsm','eal','ethnicity','notes','comments',
      'attendance','email','id','mis_id','__sheetname'
    ].map(normalizeKey);

    const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
    const scoreColumns = headers.filter(h => {
      if (metadataKeys.includes(normalizeKey(h))) return false;
      // Include column if it has numeric data OR if header contains "(N)" max-marks pattern
      // This catches assessment columns that are all-empty (e.g. not yet marked)
      if (/\(\d+\)/.test(h)) return true;
      return data.some((row: any) => {
        const v = row[h];
        return v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(String(v).trim()));
      });
    });

    // Discover assessments from column headers
    const assessmentNames: string[] = scoreColumns.map(col => {
      const marksMatch = col.match(/\((\d+)\)/);
      let name = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
      // Strip subject suffix if present
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      const allSubjects = ['Computer Science'];
      if (dashMatch && allSubjects.some(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())) {
        name = dashMatch[1].trim();
      }
      const maxMarks = marksMatch ? parseInt(marksMatch[1]) : defaultMaxMarks;
      // Find subject
      let subject = defaultSubject;
      if (dashMatch) {
        const possSubj = dashMatch[2].trim();
        const matched = allSubjects.find(s => s.toLowerCase() === possSubj.toLowerCase());
        if (matched) subject = matched;
      }
      return `\${name} (\${subject}, \${maxMarks} marks)`;
    });

    const studentNames = new Set<string>();
    const detectedGroups = new Set<string>();
    let markCount = 0;
    data.forEach((row: any) => {
      let nameRaw = ['studentname','name','student','fullname','pupil','pupilname']
        .map(k => Object.keys(row).find(rk => normalizeKey(rk) === k))
        .filter(Boolean).map(k => row[k!])[0];
      if (!nameRaw) {
        const surnameKey = Object.keys(row).find(k => normalizeKey(k) === 'surname' || normalizeKey(k) === 'lastname');
        const forenameKey = Object.keys(row).find(k => normalizeKey(k) === 'forename' || normalizeKey(k) === 'firstname');
        if (surnameKey || forenameKey) {
          nameRaw = `\${row[forenameKey||'']||''} \${row[surnameKey||'']||''}`.trim();
        }
      }
      if (!nameRaw) return;
      studentNames.add(String(nameRaw).trim());
      // Detect group from the Group column or sheet name
      const groupKey = Object.keys(row).find((k: string) => {
        const nk = normalizeKey(k);
        return nk === 'group' || nk === 'class' || nk === 'groupname';
      });
      const groupVal = groupKey ? String(row[groupKey]).trim() : (row.__sheetName ? String(row.__sheetName).trim() : '');
      if (groupVal && groupVal !== 'null' && groupVal !== 'undefined') detectedGroups.add(groupVal);
      scoreColumns.forEach(col => {
        const v = row[col];
        if (v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(String(v).trim()))) markCount++;
      });
    });

    // Build per-column subject assignments (auto-detected from header or blank)
    const colSubjects: Record<string, string> = {};
    scoreColumns.forEach(col => {
      const marksMatch = col.match(/\((\d+)\)/);
      let name = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      const allSubjects = ['Computer Science'];
      if (dashMatch && allSubjects.some(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())) {
        colSubjects[col] = allSubjects.find(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())!;
      } else {
        colSubjects[col] = defaultSubject; // Default to importConfig.subject
      }
    });
    setImportColumnSubjects(colSubjects);

    setImportPreview({
      assessments: assessmentNames,
      students: studentNames.size,
      marks: markCount,
      groups: Array.from(detectedGroups).sort()
    });
  };

  const handleAddAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAssessmentId) {
      setAssessments(prev => prev.map(a => 
        a.id === editingAssessmentId ? { ...a, ...newAssessment } : a
      ));
    } else {
      const assessment: Assessment = {
        id: Math.random().toString(36).substr(2, 9),
        ...newAssessment,
        academicYear: selectedAcademicYear
      };
      setAssessments(prev => [...prev, assessment]);
    }
    setShowAssessmentModal(false);
    setEditingAssessmentId(null);
    setNewAssessment(prev => ({ 
      ...prev,
      name: '', 
      // Keep subject, maxMarks, date, and yearGroup for convenience
    }));
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    // If no subjects explicitly set, default to all subjects for the year group
    const studentSubjects = (newStudent as any).subjects?.length
      ? (newStudent as any).subjects
      : SUBJECTS_BY_YEAR[newStudent.yearGroup] || [];
    const studentSubjectLevels = (newStudent as any).subjectLevels || {};

    if (editingStudentId) {
      setStudents(prev => prev.map(s => s.id === editingStudentId ? {
        ...s,
        ...newStudent,
        subjects: studentSubjects,
        ...(Object.keys(studentSubjectLevels).length > 0 && { subjectLevels: studentSubjectLevels }),
        ibLevel: newStudent.ibLevel
      } : s));
      setEditingStudentId(null);
    } else {
      const student: Student = {
        id: Math.random().toString(36).substr(2, 9),
        ...newStudent,
        academicYear: selectedAcademicYear,
        subjects: studentSubjects,
        ...(Object.keys(studentSubjectLevels).length > 0 && { subjectLevels: studentSubjectLevels }),
        ibLevel: (newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB') ? newStudent.ibLevel : undefined
      };
      setStudents(prev => [...prev, student]);
    }
    
    setShowStudentModal(false);
    setNewStudent(prev => ({ ...prev, name: '', preferredName: '', ibLevel: undefined, isNew: false, notes: '', subjects: undefined, subjectLevels: undefined } as any)); // Keep yearGroup and groupName
  };

  const handleAddGrade = (isAssessment: boolean = false, assessmentId?: string) => {
    if (isAssessment && assessmentId) {
      setAssessments(prev => prev.map(a => {
        if (a.id === assessmentId) {
          const studentId = marks.find(m => m.assessmentId === a.id)?.studentId;
          const yearGroup = students.find(s => s.id === studentId)?.yearGroup || 7;
          const currentBoundaries = a.boundaries || [...(yearBoundaries[yearGroup] || [])];
          return { ...a, boundaries: [...currentBoundaries, { grade: 'New', minPercentage: 0 }] };
        }
        return a;
      }));
    } else {
      setYearBoundaries(prev => ({
        ...prev,
        [selectedSettingScope]: [...(prev[selectedSettingScope] || []), { grade: 'New', minPercentage: 0 }]
      }));
    }
  };

  const handleMarkAbsent = (studentId: string, assessmentId: string, absent: boolean) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (absent) {
      const newScore = 0;
      if (existingMark) {
        setMarks(prev => prev.map(m => m.id === existingMark.id ? { ...m, absent: true, score: newScore } : m));
      } else {
        setMarks(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), studentId, assessmentId, score: newScore, absent: true } as any]);
      }
    } else {
      if (existingMark) {
        if (existingMark.score === 0) {
          fbDeleteMark(existingMark.id);
          setMarks(prev => prev.filter(m => m.id !== existingMark.id));
        } else {
          const updated = { ...existingMark };
          delete (updated as any).absent;
          setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
        }
      }
    }
  };

  const handleUpdateMark = (studentId: string, assessmentId: string, score: number | null) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (score === null || isNaN(score)) {
      if (existingMark) {
        fbDeleteMark(existingMark.id);
        setMarks(prev => prev.filter(m => m.id !== existingMark.id));
      }
      return;
    }

    const assessment = assessments.find(a => a.id === assessmentId);
    const maxMarks = assessment?.maxMarks || 100;
    const validatedScore = Math.min(maxMarks, Math.max(0, score));
    
    if (existingMark) {
      setMarks(prev => prev.map(m => m.id === existingMark.id ? { ...m, score: validatedScore } : m));
    } else {
      setMarks(prev => [...prev, { 
        id: Math.random().toString(36).substr(2, 9),
        studentId, 
        assessmentId, 
        score: validatedScore 
      }]);
    }
  };

  const getGrade = (percentage: number, boundaries: GradeBoundary[]) => {
    const sorted = [...boundaries].sort((a, b) => b.minPercentage - a.minPercentage);
    for (const b of sorted) {
      if (percentage >= b.minPercentage) return b.grade;
    }
    return 'U';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'on-track': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'needs-improvement': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'no-data': return 'text-slate-400 bg-slate-50 border-slate-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-rose-500" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">CS Data Tracker</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Computer Science Department</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            {[
              { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
              { id: 'performance', icon: TrendingUp, label: 'Performance' },
              { id: 'students', icon: Users, label: 'Students' },
              { id: 'assessments', icon: Plus, label: 'Assessments' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Academic Year</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={selectedAcademicYear}
                onChange={(e) => {
                  const oldYear = selectedAcademicYear;
                  const newYear = e.target.value;
                  setSelectedAcademicYear(newYear);
                  
                  // If moving forward one year, try to follow the cohort
                  if (getNextAcademicYear(oldYear) === newYear) {
                    const nextYG = getNextYearGroup(yearFilter as YearGroup);
                    if (nextYG) setYearFilter(nextYG);
                  } 
                  // If moving backward one year, try to follow back
                  else if (getPreviousAcademicYear(oldYear) === newYear) {
                    const prevYG = getPreviousYearGroup(yearFilter as YearGroup);
                    if (prevYG) setYearFilter(prevYG);
                  }
                }}
              >
                {ACADEMIC_YEARS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year Group</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={yearFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all') setYearFilter('all');
                  else if (!isNaN(parseInt(val)) && val.length === 1) setYearFilter(parseInt(val) as YearGroup);
                  else setYearFilter(val as YearGroup);
                  setGroupFilter('all'); // Reset group filter when year changes
                  setPerformanceSubjectFilter('all'); // Reset subject filter when year changes
                }}
              >
                <option value="IGCSE_ALL">IGCSE (All)</option>
                <option value="IB_ALL">IB (All)</option>
                {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                  <option key={y} value={y}>{y === 'Graduated' ? 'Alumni / Graduated' : (typeof y === 'number' ? `Year ${y}` : y)}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="all">All Groups</option>
                {availableGroups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
            {(String(yearFilter).includes('IB') || yearFilter === 'IB_ALL') && (
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">IB Level</span>
                <select 
                  className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  value={ibLevelFilter}
                  onChange={(e) => setIbLevelFilter(e.target.value as any)}
                >
                  <option value="all">Both HL/SL</option>
                  <option value="HL">HL Only</option>
                  <option value="SL">SL Only</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={performanceSubjectFilter}
                onChange={(e) => setPerformanceSubjectFilter(e.target.value)}
              >
                <option value="all">All Subjects</option>
                {Array.from(new Set(
                  // Only show subjects that actually have assessments in the selected year
                  assessments
                    .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter))
                    .map(a => a.subject)
                    // Fall back to theoretical subjects if no assessments exist yet
                    .concat(
                      yearFilter === 'all' ? Object.values(SUBJECTS_BY_YEAR).flat() :
                      yearFilter === 'IGCSE_ALL' ? [...SUBJECTS_BY_YEAR['10 IGCSE'], ...SUBJECTS_BY_YEAR['11 IGCSE']] :
                      yearFilter === 'IB_ALL' ? [...SUBJECTS_BY_YEAR['12 IB'], ...SUBJECTS_BY_YEAR['13 IB']] :
                      SUBJECTS_BY_YEAR[yearFilter as YearGroup] || []
                    )
                )).map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={backupData}
              className="btn-secondary flex items-center gap-2 text-sm"
              title="Backup All Data"
            >
              <Download className="w-4 h-4" />
              Backup
            </button>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              Restore
              <input type="file" accept=".json" onChange={restoreBackup} className="hidden" />
            </label>
            <button 
              onClick={downloadTemplate}
              className="btn-secondary flex items-center gap-2 text-sm"
              title="Download CSV Template"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              Upload CSV/Excel
              <input id="file-upload" type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Students</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">{filteredPerformances.length}</h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' 
                        ? `Across ${new Set(students.filter(s => s.academicYear === selectedAcademicYear).map(s => s.yearGroup)).size} year groups`
                        : yearFilter === 'IGCSE_ALL' ? 'All IGCSE Students'
                        : yearFilter === 'IB_ALL' ? 'All IB Students'
                        : `In ${formatYearGroup(yearFilter as YearGroup)}`}
                    </p>
                  </div>
                </div>

                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg. Performance</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">
                      {(() => {
                        const withData = filteredPerformances.filter(p => (p as any).hasData);
                        return withData.length > 0
                          ? `${(withData.reduce((acc, p) => acc + p.averagePercentage, 0) / withData.length).toFixed(1)}%`
                          : '—';
                      })()}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' ? 'School-wide average' 
                        : yearFilter === 'IGCSE_ALL' ? 'IGCSE average'
                        : yearFilter === 'IB_ALL' ? 'IB average'
                        : `${formatYearGroup(yearFilter as YearGroup)} average`}
                    </p>
                  </div>
                </div>

                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Assessments</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">
                      {assessments.filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter)).length}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' ? 'Total recorded tests' : 
                       yearFilter === 'IGCSE_ALL' ? 'Total IGCSE tests' :
                       yearFilter === 'IB_ALL' ? 'Total IB tests' :
                       `Tests for ${formatYearGroup(yearFilter as YearGroup)}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => { setActiveTab('assessments'); setShowAssessmentModal(true); }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-lg shadow-indigo-100 transition-all group text-left flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest">Quick Action</span>
                      <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold leading-tight">Create New Assessment</h3>
                      <p className="text-[9px] text-indigo-200 font-medium mt-0.5">Record marks manually</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    className="flex-1 bg-white hover:bg-slate-50 text-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm transition-all group text-left flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Quick Action</span>
                      <Upload className="w-4 h-4 text-indigo-600 group-hover:-translate-y-1 transition-transform" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold leading-tight">Import Data</h3>
                      <p className="text-[9px] text-slate-500 font-medium mt-0.5">Upload Excel spreadsheet</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Calculation Notes */}
              <div className="card p-4 bg-indigo-50/50 border-indigo-100/50">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-900 mb-1">Data Calculation Notes</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Absent Students</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          Assessments marked as <strong>Absent</strong> are excluded from the average calculation. They do not count as 0%; they are simply ignored to ensure the average reflects actual performance.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">New Students</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          Students with no recorded marks (or only absent marks) will display as <strong>"No data"</strong>. Their statistics will begin appearing as soon as their first assessment score is entered.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Average Logic</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          All averages are calculated as the mean of percentages across all assessments the student has sat. This provides a fair comparison regardless of the maximum marks of each test.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {filteredPerformances.length === 0 ? (
                  <div className="lg:col-span-3 card p-12 flex flex-col items-center justify-center text-center bg-slate-50/50 border-dashed border-2">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No students found</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                      We couldn't find any students matching your current filters for {selectedAcademicYear}. 
                      Try changing the year group or uploading an Excel file.
                    </p>
                    <button 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="mt-6 btn-primary flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Data
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="card p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-6">Subject Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectPerformanceData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="average" radius={[0, 4, 4, 0]} barSize={30}>
                          {subjectPerformanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={SUBJECT_COLORS[entry.subject] || '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Year Group Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="average" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Group Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="average" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 font-display tracking-tight flex items-center justify-between">
                    Performance Distribution
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded-lg">Based on {yearFilter === 'all' ? 'All Years' : yearFilter} Settings</span>
                  </h3>
                  <div className="space-y-6">
                    {gradeDistribution.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium text-slate-700">{item.label}</span>
                          <span className="text-slate-500 font-bold">{item.count}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / (filteredPerformances.length || 1)) * 100}%` }}
                            className={`${item.color} h-full`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}

          {activeTab === 'performance' && (
            <motion.div 
              key="performance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Performance Analytics</h2>
                  <p className="text-xs text-slate-500 font-medium">In-depth analysis of student progress and subject trends</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[150px]"
                      value={selectedStudentForPerformance}
                      onChange={(e) => setSelectedStudentForPerformance(e.target.value)}
                    >
                      <option value="none">Select Student...</option>
                      {students
                        .filter(s => s.academicYear === selectedAcademicYear && matchesYearFilter(s.yearGroup, yearFilter))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[120px]"
                      value={performanceSubjectFilter}
                      onChange={(e) => setPerformanceSubjectFilter(e.target.value)}
                    >
                      <option value="all">All Subjects</option>
                      {Array.from(new Set(assessments.filter(a => a.academicYear === selectedAcademicYear).map(a => a.subject))).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-4 flex items-center gap-4 bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Average</p>
                    <h4 className="text-xl font-bold text-slate-900">{performanceInsights?.average.toFixed(1) || '0.0'}%</h4>
                  </div>
                </div>
                <div className="card p-4 flex items-center gap-4 bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Best Group</p>
                    <h4 className="text-xl font-bold text-slate-900">{performanceInsights?.bestGroup?.name || 'N/A'}</h4>
                    <p className="text-[10px] text-emerald-600 font-bold">{performanceInsights?.bestGroup?.avg.toFixed(1)}% Avg</p>
                  </div>
                </div>
                <div className="card p-4 flex items-center gap-4 bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Most Improved</p>
                    <h4 className="text-xl font-bold text-slate-900 truncate max-w-[150px]">{performanceInsights?.mostImproved?.name || 'N/A'}</h4>
                    <p className="text-[10px] text-amber-600 font-bold">+{performanceInsights?.mostImproved?.improvement.toFixed(1)}% Growth</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Column: Top Performers & Needs Support */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="card p-6 bg-gradient-to-b from-white to-emerald-50/30">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      Top Performers
                    </h3>
                    <div className="space-y-3">
                      {topPerformersList.length > 0 ? topPerformersList.map((p, idx) => (
                        <button 
                          key={p.student.id} 
                          onClick={() => setSelectedStudentForPerformance(p.student.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all hover:shadow-sm border border-transparent hover:border-slate-100 ${selectedStudentForPerformance === p.student.id ? 'bg-white shadow-sm border-slate-100' : 'hover:bg-white'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}</span>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-900 truncate">{p.student.name}</p>
                              <p className="text-[10px] text-slate-500">{p.student.groupName}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-100">
                              {(p as any).hasData ? `${p.averagePercentage.toFixed(1)}%` : '—'}
                            </span>
                            {(p as any).hasData && (
                              <span className="text-[10px] font-black text-slate-800 tracking-tighter">
                                {getGrade(p.averagePercentage, yearBoundaries[p.student.groupName] || yearBoundaries[p.student.yearGroup] || (
                                  String(p.student.yearGroup).includes('IB') ? IB_BOUNDARIES :
                                  String(p.student.yearGroup).includes('IGCSE') ? IGCSE_BOUNDARIES :
                                  KS3_BOUNDARIES
                                ))}
                              </span>
                            )}
                          </div>
                        </button>
                      )) : (
                        <p className="text-xs text-slate-400 italic text-center py-4">No data available</p>
                      )}
                    </div>
                  </div>

                  <div className="card p-6 bg-gradient-to-b from-white to-rose-50/30">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
                        <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                      </div>
                      Needs Support
                    </h3>
                    <div className="space-y-3">
                      {needsSupportList.length > 0 ? needsSupportList.map((p, idx) => (
                        <button 
                          key={p.student.id} 
                          onClick={() => setSelectedStudentForPerformance(p.student.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all hover:shadow-sm border border-transparent hover:border-slate-100 ${selectedStudentForPerformance === p.student.id ? 'bg-white shadow-sm border-slate-100' : 'hover:bg-white'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}</span>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-900 truncate">{p.student.name}</p>
                              <p className="text-[10px] text-slate-500">{p.student.groupName}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-100">
                              {(p as any).hasData ? `${p.averagePercentage.toFixed(1)}%` : '—'}
                            </span>
                            {(p as any).hasData && (
                              <span className="text-[10px] font-black text-slate-800 tracking-tighter">
                                {getGrade(p.averagePercentage, yearBoundaries[p.student.groupName] || yearBoundaries[p.student.yearGroup] || (
                                  String(p.student.yearGroup).includes('IB') ? IB_BOUNDARIES :
                                  String(p.student.yearGroup).includes('IGCSE') ? IGCSE_BOUNDARIES :
                                  KS3_BOUNDARIES
                                ))}
                              </span>
                            )}
                          </div>
                        </button>
                      )) : (
                        <p className="text-xs text-slate-400 italic text-center py-4">No data available</p>
                      )}
                    </div>
                  </div>

                  <div className="card p-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      Grade Distribution
                    </h3>
                    <div className="space-y-4">
                      {performanceTabGradeDistribution.map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-[10px] mb-1.5">
                            <span className="font-bold text-slate-600 uppercase tracking-tighter">{item.label}</span>
                            <span className="text-slate-400 font-bold">{item.count} students</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(item.count / (performanceTabStats.length || 1)) * 100}%` }}
                              className={`${item.color} h-full`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Detailed Charts */}
                <div className="lg:col-span-3 space-y-6">
                  {selectedStudentForPerformance !== 'none' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="card p-6 border-indigo-100 bg-indigo-50/10"
                    >
                      <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center justify-between">
                        <span>
                          Individual Progress: <span className="text-indigo-600">{students.find(s => s.id === selectedStudentForPerformance)?.name}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personal Trend</span>
                          <button 
                            onClick={() => setSelectedStudentForPerformance('none')}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={individualStudentTrendData}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="date" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#64748b', fontSize: 11 }} 
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#64748b', fontSize: 11 }} 
                              domain={[0, 100]} 
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(value: number, name: string, props: any) => [
                                `${value.toFixed(1)}%`, 
                                `${props.payload.assessmentName} (${props.payload.subject})`
                              ]}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#6366f1" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorScore)" 
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#6366f1' }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  <div className="card p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center justify-between">
                      Subject Progress Trends
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average Score %</span>
                        </div>
                      </div>
                    </h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={subjectTrendData.filter(d => performanceSubjectFilter === 'all' || d.subject === performanceSubjectFilter)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            tickFormatter={(date) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }} 
                            domain={[0, 100]} 
                            tickFormatter={(val) => `${val}%`}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}
                            formatter={(value: number, name: string, props: any) => [
                              <span key="val" className="font-bold text-indigo-600">{value}%</span>,
                              <div key="info" className="text-[10px] text-slate-500 mt-1">
                                <p className="font-bold text-slate-700">{props.payload.name}</p>
                                <p>{props.payload.subject}</p>
                              </div>
                            ]}
                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          />
                          <Legend 
                            verticalAlign="top" 
                            align="right" 
                            iconType="circle" 
                            height={36}
                            wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          />
                          {(Array.from(new Set(subjectTrendData.map(d => d.subject))) as string[])
                            .filter(subject => performanceSubjectFilter === 'all' || subject === performanceSubjectFilter)
                            .map((subject) => (
                            <Line 
                              key={subject}
                              type="monotone" 
                              dataKey="average" 
                              data={subjectTrendData.filter(d => d.subject === subject)}
                              name={subject}
                              stroke={SUBJECT_COLORS[subject] || '#6366f1'} 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: SUBJECT_COLORS[subject] || '#6366f1' }}
                              activeDot={{ r: 6, strokeWidth: 0, fill: SUBJECT_COLORS[subject] || '#6366f1' }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card p-6">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center justify-between">
                        Subject Comparison
                        <BarChart3 className="w-4 h-4 text-slate-300" />
                      </h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={subjectPerformanceData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" domain={[0, 100]} hide />
                            <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="average" radius={[0, 4, 4, 0]} barSize={20}>
                              {subjectPerformanceData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={SUBJECT_COLORS[entry.subject] || '#6366f1'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="card p-6">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center justify-between">
                        Group Performance Gap
                        <Users className="w-4 h-4 text-slate-300" />
                      </h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={groupPerformanceData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="average" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6 overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <List className="w-5 h-5 text-indigo-500" />
                        Class Marksheet Overview
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredPerformances.length} Students — {performanceTabAssessments.length} Assessments</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky left-0 bg-slate-50 z-20 border-r border-slate-200 min-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'name', direction: prev.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                            >
                              <div className="flex items-center gap-1">
                                Student Name
                                {(yearFilter === '12 IB' || yearFilter === '13 IB' || yearFilter === 'IB_ALL') && marksheetSort.key === 'level' && <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1 rounded ml-1">HL/SL</span>}
                                {marksheetSort.key === 'name' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'avg', direction: prev.key === 'avg' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                              <div className="flex items-center justify-center gap-1">
                                Avg %
                                {marksheetSort.key === 'avg' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200">
                              Avg Grade
                            </th>
                            {performanceTabAssessments.map(a => (
                              <th key={a.id} className="py-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center min-w-[100px] border-r border-slate-200 last:border-r-0">
                                <div className="flex flex-col items-center">
                                  <span className="truncate max-w-[90px]" title={a.name}>{a.name}</span>
                                  <span className="text-[8px] text-indigo-500 font-bold">max: {a.maxMarks}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedMarksheetPerformances.length > 0 ? sortedMarksheetPerformances.map(p => {
                            return (
                              <tr key={p.student.id} className={`${p.student.isNew ? 'bg-amber-50/50' : ''} hover:bg-indigo-50/30 transition-colors group`}>
                                <td className={`py-2.5 px-4 sticky left-0 ${p.student.isNew ? 'bg-amber-50/90' : 'bg-white'} group-hover:bg-indigo-50/30 z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]`}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      p.status === 'excellent' ? 'bg-emerald-500' : 
                                      p.status === 'on-track' ? 'bg-indigo-400' : 
                                      p.status === 'needs-improvement' ? 'bg-rose-400' :
                                      'bg-slate-300'
                                    }`}></div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-slate-900 truncate">{p.student.name}</span>
                                      {p.student.isNew && (
                                        <span className="text-[7px] font-black text-amber-600 uppercase tracking-tighter leading-none">Joined Late</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200">
                                  {(p as any).hasData ? (
                                    <span className={`text-xs font-bold leading-none py-1 px-2 rounded-lg ${
                                      p.averagePercentage >= 80 ? 'bg-emerald-50 text-emerald-700' : 
                                      p.averagePercentage >= 50 ? 'bg-indigo-50 text-indigo-700' : 
                                      'bg-rose-50 text-rose-700'
                                    }`}>
                                      {p.averagePercentage.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200">
                                  {(p as any).hasData ? (
                                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                                      p.status === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
                                      p.status === 'needs-improvement' ? 'bg-rose-100 text-rose-700' :
                                      'bg-indigo-100 text-indigo-700'
                                    }`}>
                                      {getGrade(p.averagePercentage, yearBoundaries[p.student.groupName] || yearBoundaries[p.student.yearGroup] || (
                                        String(p.student.yearGroup).includes('IB') ? IB_BOUNDARIES :
                                        String(p.student.yearGroup).includes('IGCSE') ? IGCSE_BOUNDARIES :
                                        KS3_BOUNDARIES
                                      ))}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-slate-300">—</span>
                                  )}
                                </td>
                                {performanceTabAssessments.map(a => {
                                  const mark = p.marks.find(m => m.assessmentId === a.id);
                                  if (!mark) {
                                    return (
                                      <td key={a.id} className="py-2.5 px-2 text-center border-r border-slate-100 last:border-r-0 italic text-slate-300 text-[10px]">
                                        —
                                      </td>
                                    );
                                  }
                                  
                                  const percentage = (mark.score / a.maxMarks) * 100;
                                  const isAbsent = (mark as any).absent;
                                  
                                  return (
                                    <td key={a.id} className="py-2.5 px-2 text-center border-r border-slate-100 last:border-r-0">
                                      {isAbsent ? (
                                        <span className="text-[9px] font-bold text-rose-500 px-1.5 py-0.5 bg-rose-50 rounded">ABS</span>
                                      ) : (
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-800">{mark.score}</span>
                                          <span className={`text-[9px] font-medium ${
                                            percentage >= 80 ? 'text-emerald-500' : 
                                            percentage >= 40 ? 'text-slate-400' : 
                                            'text-rose-500'
                                          }`}>{percentage.toFixed(0)}%</span>
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={performanceTabAssessments.length + 2} className="py-12 text-center bg-white">
                                <p className="text-sm text-slate-400 italic">No students found matching current filters.</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'students' && (
            <motion.div 
              key="students"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Student List */}
              <div className="lg:col-span-1 space-y-4">
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      const defaultYear = (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') ? yearFilter : newStudent.yearGroup;
                      const firstGroup = groups.find(g => g.yearGroup === defaultYear)?.name || '';
                      setNewStudent(prev => ({ 
                        ...prev, 
                        yearGroup: defaultYear, 
                        groupName: prev.groupName || firstGroup 
                      }));
                      setShowStudentModal(true);
                    }}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Student
                  </button>
                  <button 
                    onClick={downloadStudentTemplate}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Student Template
                  </button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search students..." 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {(yearFilter === '12 IB' || yearFilter === '13 IB' || yearFilter === 'IB_ALL') && (
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      {(['all', 'HL', 'SL'] as const).map(level => (
                        <button
                          key={level}
                          onClick={() => setIbLevelFilter(level)}
                          className={`flex-1 py-1 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                            ibLevelFilter === level 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student List</span>
                    <button 
                      onClick={() => setExpandedSections(new Set())}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                <div className="card max-h-[calc(100vh-250px)] overflow-y-auto divide-y divide-slate-100">
                  {filteredPerformances.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-xs text-slate-400 italic">No students found</p>
                    </div>
                  ) : (
                    ([7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'] as YearGroup[])
                      .filter(y => matchesYearFilter(y, yearFilter))
                      .map(year => {
                        const yearStudents = filteredPerformances.filter(p => p.student.yearGroup === year);
                        // Only show groups that have actual students (prevents ghost/deleted groups)
                        const yearGroups = (Array.from(new Set(yearStudents.map(p => p.student.groupName))).filter(Boolean) as string[]).sort((a, b) => a.localeCompare(b));
                        
                        if (yearGroups.length === 0 && yearStudents.length === 0) return null;
                        
                        const yearSectionId = `year-${year}`;
                        const isYearExpanded = expandedSections.has(yearSectionId);
                        
                        return (
                          <div key={year} className="bg-white">
                            <div 
                              onClick={() => toggleSection(yearSectionId)}
                              className="px-4 py-2 bg-slate-50 border-y border-slate-100 flex items-center justify-between group/year cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {isYearExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{year === 'Graduated' ? 'Alumni / Graduated' : (typeof year === 'number' ? `Year ${year}` : year)}</h4>
                              </div>
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <select 
                                  className="bg-transparent text-[8px] font-bold text-slate-400 uppercase tracking-tighter outline-none cursor-pointer hover:text-rose-500 transition-colors"
                                  defaultValue=""
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                      handleDeleteClass(year, val);
                                      e.target.value = ''; // Reset after delete
                                    }
                                  }}
                                >
                                  <option value="" disabled>Bulk Delete Class</option>
                                  {yearGroups.map(g => (
                                    <option key={g} value={g}>Delete Group {g}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {isYearExpanded && (
                              (year === '12 IB' || year === '13 IB') ? (
                                ['HL', 'SL'].map(level => {
                                  const levelStudentsFromYear = yearStudents.filter(p => p.student.ibLevel === level);
                                  const levelGroups = (Array.from(new Set(levelStudentsFromYear.map(p => p.student.groupName))).filter(Boolean) as string[]).sort((a, b) => a.localeCompare(b));
                                  
                                  if (levelGroups.length === 0) return null;

                                  return (
                                    <div key={level} className="border-l-2 border-indigo-100 ml-2">
                                      <div className="px-4 py-1 bg-indigo-50/50 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500">{level} Level Classes</span>
                                        <span className="text-[7px] font-bold text-indigo-300">{levelStudentsFromYear.length} students</span>
                                      </div>
                                      {levelGroups.map(groupName => {
                                        const groupPerformance = levelStudentsFromYear
                                          .filter(p => p.student.groupName === groupName)
                                          .sort((a, b) => a.student.name.localeCompare(b.student.name));
                                        
                                        const groupSectionId = `group-${year}-${level}-${groupName}`;
                                        const isGroupExpanded = expandedSections.has(groupSectionId);

                                        return (
                                          <div key={groupName} className="border-b border-slate-50 last:border-0 text-left">
                                            <div 
                                              onClick={() => toggleSection(groupSectionId)}
                                              className="px-4 py-1.5 bg-white flex items-center justify-between group/header cursor-pointer hover:bg-indigo-50/20 transition-colors"
                                            >
                                              <div className="flex items-center gap-2">
                                                {isGroupExpanded ? <ChevronDown className="w-2.5 h-2.5 text-indigo-300" /> : <ChevronRight className="w-2.5 h-2.5 text-indigo-300" />}
                                                <h5 className="text-[9px] font-bold uppercase tracking-tighter text-indigo-400">Class {groupName}</h5>
                                              </div>
                                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <button 
                                                  onClick={() => handleDeleteClass(year as YearGroup, groupName as string)}
                                                  className="opacity-0 group-hover/header:opacity-100 flex items-center gap-1 text-[8px] font-bold text-rose-500 hover:text-rose-600 transition-all"
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                  Delete
                                                </button>
                                              </div>
                                            </div>
                                            {isGroupExpanded && groupPerformance.map((p) => (
                                              <div
                                                key={p.student.id}
                                                onClick={() => setSelectedStudentId(p.student.id)}
                                                className={`w-full cursor-pointer px-3 py-1.5 transition-colors flex items-center justify-between group ${
                                                  selectedStudentId === p.student.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                                }`}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    setSelectedStudentId(p.student.id);
                                                  }
                                                }}
                                              >
                                                <div className="flex items-center gap-2">
                                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] flex-shrink-0 ${
                                                    selectedStudentId === p.student.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                                  }`}>
                                                    {(p.student.preferredName || p.student.name).split(' ').map((n: string) => n[0]).join('')}
                                                  </div>
                                                  <div className="min-w-0">
                                                    <p className="font-bold text-slate-900 text-[11px] truncate max-w-[100px]">
                                                      {p.student.preferredName || p.student.name}
                                                      {p.student.isNew && <span className="ml-1 text-[7px] text-amber-500 uppercase">New</span>}
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  <div className="flex flex-col items-end">
                                                    <span className={`text-[8px] font-bold px-1 rounded-sm border ${getStatusColor(p.status)}`}>
                                                      {(p as any).hasData ? `${p.averagePercentage.toFixed(0)}%` : '—'}
                                                    </span>
                                                    {(p as any).hasData && (
                                                      <span className="text-[9px] font-black text-slate-700 mt-0.5">
                                                        {getGrade(p.averagePercentage, yearBoundaries[p.student.groupName] || yearBoundaries[p.student.yearGroup] || (
                                                          String(p.student.yearGroup).includes('IB') ? IB_BOUNDARIES :
                                                          String(p.student.yearGroup).includes('IGCSE') ? IGCSE_BOUNDARIES :
                                                          KS3_BOUNDARIES
                                                        ))}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button 
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDeleteStudent(p.student.id);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-rose-500"
                                                  >
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })
                              ) : (
                                yearGroups.map(groupName => {
                                  const groupStudents = yearStudents
                                    .filter(p => p.student.groupName === groupName)
                                    .sort((a, b) => a.student.name.localeCompare(b.student.name));
                                  const groupSectionId = `group-${year}-${groupName}`;
                                  const isGroupExpanded = expandedSections.has(groupSectionId);

                                  return (
                                    <div key={groupName}>
                                      <div 
                                        onClick={() => toggleSection(groupSectionId)}
                                        className="px-4 py-1.5 bg-white flex items-center justify-between group/header cursor-pointer hover:bg-slate-50 transition-colors"
                                      >
                                        <div className="flex items-center gap-2">
                                          {isGroupExpanded ? <ChevronDown className="w-2.5 h-2.5 text-indigo-300" /> : <ChevronRight className="w-2.5 h-2.5 text-indigo-300" />}
                                          <h5 className="text-[9px] font-bold uppercase tracking-tighter text-indigo-400">Class {groupName}</h5>
                                        </div>
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                          {groupStudents.length > 0 && (
                                            <button 
                                              onClick={() => handleDeleteClass(year as YearGroup, groupName as string)}
                                              className="opacity-0 group-hover/header:opacity-100 flex items-center gap-1 text-[8px] font-bold text-rose-500 hover:text-rose-600 transition-all"
                                              title="Delete all students in this class"
                                            >
                                              <Trash2 className="w-2.5 h-2.5" />
                                              Delete
                                            </button>
                                          )}
                                          {groupStudents.length === 0 && (
                                            <span className="text-[8px] text-slate-300 italic">Empty</span>
                                          )}
                                        </div>
                                      </div>
                                      {isGroupExpanded && groupStudents.map((p) => (
                                        <div
                                          key={p.student.id}
                                          onClick={() => setSelectedStudentId(p.student.id)}
                                          className={`w-full cursor-pointer text-left px-3 py-1.5 transition-colors flex items-center justify-between group ${
                                            selectedStudentId === p.student.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                          }`}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              setSelectedStudentId(p.student.id);
                                            }
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] flex-shrink-0 ${
                                              selectedStudentId === p.student.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                              {(p.student.preferredName || p.student.name).split(' ').map((n: string) => n[0]).join('')}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-bold text-slate-900 text-[11px] truncate max-w-[100px]">
                                                {p.student.preferredName || p.student.name}
                                                {p.student.isNew && <span className="ml-1 text-[7px] text-amber-500 uppercase">New</span>}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <span className={`text-[8px] px-1 py-0.5 rounded-full border font-bold ${getStatusColor(p.status)}`}>
                                              {(p as any).hasData ? `${p.averagePercentage.toFixed(0)}%` : '—'}
                                            </span>
                                            {getTrendIcon(p.trend)}
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteStudent(p.student.id);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 rounded text-rose-500 transition-opacity"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })
                              )
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Student Detail */}
              <div className="lg:col-span-2">
                {selectedStudentId ? (
                  <div className="space-y-6">
                    {performances.filter(p => p.student.id === selectedStudentId).map(p => (
                      <div key={p.student.id} className="space-y-6">
                        <div className="card p-6">
                          <div className="flex items-center justify-between mb-8">
                            <div>
                              <h2 className="text-2xl font-bold text-slate-900">
                                {p.student.preferredName || p.student.name}
                                {p.student.ibLevel && (
                                  <span className={`ml-3 px-2 py-0.5 rounded-lg text-sm font-bold align-middle ${
                                    p.student.ibLevel === 'HL' ? 'bg-violet-100 text-violet-600 border border-violet-200' : 'bg-sky-100 text-sky-600 border border-sky-200'
                                  }`}>
                                    {p.student.ibLevel} Level
                                  </span>
                                )}
                                {p.student.isNew && (
                                  <span className="ml-3 px-2 py-0.5 rounded-lg text-sm font-bold align-middle bg-amber-100 text-amber-700 border border-amber-200">
                                    New Admission
                                  </span>
                                )}
                                {p.student.preferredName && p.student.preferredName !== p.student.name && (
                                  <span className="ml-3 text-lg text-slate-400 font-medium">({p.student.name})</span>
                                )}
                              </h2>
                              <div className="flex items-center gap-2 mt-1">
                                <button 
                                  onClick={() => {
                                    setEditingStudentId(p.student.id);
                                    setNewStudent({
                                      name: p.student.name,
                                      preferredName: p.student.preferredName || '',
                                      yearGroup: p.student.yearGroup,
                                      groupName: p.student.groupName,
                                      ibLevel: p.student.ibLevel,
                                      isNew: !!p.student.isNew,
                                      notes: p.student.notes || '',
                                      ...((p.student as any).subjects && { subjects: (p.student as any).subjects }),
                                      ...((p.student as any).subjectLevels && { subjectLevels: (p.student as any).subjectLevels })
                                    } as any);
                                    setShowStudentModal(true);
                                  }}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit Details
                                </button>
                              </div>
                              <p className="text-slate-500 mt-2">
                                {formatYearGroup(p.student.yearGroup)} • {p.student.groupName} • {' '}
                                {(p as any).hasData 
                                  ? (
                                    <>
                                      Overall Average: <span className="font-bold text-slate-700">{p.averagePercentage.toFixed(1)}%</span>
                                      <span className="ml-2 text-[10px] text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded" title="Averages exclude any assessments marked as Absent">
                                        Excl. Absences
                                      </span>
                                    </>
                                  )
                                  : <span className="text-slate-400 italic">No assessments sat yet</span>
                                }
                                {(p as any).absentCount > 0 && (
                                  <span className="ml-2 text-[11px] text-rose-400">• {(p as any).absentCount} absent</span>
                                )}
                              </p>
                              {/* HL/SL subject level badges for IB students */}
                              {(p.student as any).subjectLevels && Object.keys((p.student as any).subjectLevels).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {Object.entries((p.student as any).subjectLevels as Record<string, string>).map(([subject, level]) => (
                                    <span 
                                      key={subject}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        level === 'HL' 
                                          ? 'bg-violet-50 text-violet-700 border-violet-200' 
                                          : 'bg-sky-50 text-sky-700 border-sky-200'
                                      }`}
                                    >
                                      <span style={{ color: SUBJECT_COLORS[subject] || '#6366f1' }}>●</span>
                                      {subject} <span className="opacity-75">{level}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {p.student.notes && (
                            <div className={`mb-6 p-4 rounded-xl border ${p.student.isNew ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${p.student.isNew ? 'text-amber-700' : 'text-slate-500'}`}>
                                <FileText className="w-3 h-3" />
                                Teacher Notes
                              </h4>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap italic">
                                "{p.student.notes}"
                              </p>
                            </div>
                          )}

                          <div className="h-[250px] mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={(performanceSubjectFilter === 'all' ? p.marks : p.marks.filter(m => m.assessment.subject === performanceSubjectFilter)).map(m => ({
                                name: m.assessment.name,
                                score: (m.score / m.assessment.maxMarks) * 100
                              }))}>
                                <defs>
                                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                                <Tooltip 
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="score" stroke="#4f46e5" fillOpacity={1} fill="url(#colorScore)" strokeWidth={2} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                                  <th className="pb-3 px-2">Assessment</th>
                                  <th className="pb-3 px-2">Subject</th>
                                  <th className="pb-3 px-2">Date</th>
                                  <th className="pb-3 px-2">Score</th>
                                  <th className="pb-3 px-2 text-right">Grade</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {(performanceSubjectFilter === 'all' ? p.marks : p.marks.filter(m => m.assessment.subject === performanceSubjectFilter)).map((m, idx) => {
                                  const percentage = (m.score / m.assessment.maxMarks) * 100;
                                  const currentBoundaries = m.assessment.boundaries || yearBoundaries[p.student.yearGroup] || [];
                                  const grade = getGrade(percentage, currentBoundaries);
                                  
                                  return (
                                    <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                      <td className="py-3 px-2 font-medium text-slate-900">{m.assessment.name}</td>
                                      <td className="py-3 px-2 text-slate-600">{m.assessment.subject}</td>
                                      <td className="py-3 px-2 text-slate-500">{m.assessment.date}</td>
                                      <td className="py-3 px-2 text-slate-900 font-mono">{m.score}/{m.assessment.maxMarks}</td>
                                      <td className="py-3 px-2 text-right">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs ${
                                          percentage >= 80 ? 'bg-emerald-100 text-emerald-700' : 
                                          percentage < 50 ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                          {grade}
                                        </span>
                                        <span className="ml-2 text-[10px] text-slate-400 font-medium">{percentage.toFixed(0)}%</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card h-full flex flex-col items-center justify-center p-12 text-center text-slate-400">
                    <Users className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Select a student to view detailed performance</p>
                    <p className="text-sm">You can search or filter students using the sidebar</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'assessments' && (
            <motion.div 
              key="assessments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Assessments & Marks</h2>
                <button 
                  onClick={() => {
                    const defaultYear = (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') ? yearFilter : newAssessment.yearGroup;
                    setNewAssessment(prev => ({ 
                      ...prev, 
                      yearGroup: defaultYear,
                      subject: prev.yearGroup === defaultYear ? prev.subject : SUBJECTS_BY_YEAR[defaultYear][0]
                    }));
                    setShowAssessmentModal(true);
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Assessment
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'IGCSE_ALL', label: 'IGCSE' },
                    { id: 'IB_ALL', label: 'IB' },
                    { id: 7, label: 'Y7' },
                    { id: 8, label: 'Y8' },
                    { id: 9, label: 'Y9' },
                    { id: '10 IGCSE', label: 'Y10' },
                    { id: '11 IGCSE', label: 'Y11' },
                    { id: '12 IB', label: 'Y12' },
                    { id: '13 IB', label: 'Y13' },
                    { id: 'Graduated', label: 'Graduated' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => {
                        if (filter.id === 'all') setYearFilter('all');
                        else if (filter.id === 'IGCSE_ALL') setYearFilter('IGCSE_ALL');
                        else if (filter.id === 'IB_ALL') setYearFilter('IB_ALL');
                        else setYearFilter(filter.id as YearGroup);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        yearFilter === filter.id 
                          ? 'bg-white text-indigo-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assessments
                  .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter) && (performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter) && (ibLevelFilter === 'all' || !a.ibLevel || a.ibLevel === ibLevelFilter))
                  .map(assessment => (
                  <div key={assessment.id} className="card p-6 hover:border-indigo-200 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span 
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 inline-block"
                          style={{ 
                            backgroundColor: `${SUBJECT_COLORS[assessment.subject] || '#6366f1'}15`,
                            color: SUBJECT_COLORS[assessment.subject] || '#6366f1'
                          }}
                        >
                          {assessment.subject}
                        </span>
                        <h3 className="text-lg font-bold text-slate-900">{assessment.name}</h3>
                        <p className="text-sm text-slate-500">
                          {formatYearGroup(assessment.yearGroup)} • {assessment.date}
                          {assessment.ibLevel && (
                             <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                               assessment.ibLevel === 'HL' ? 'bg-violet-100 text-violet-600' : 'bg-sky-100 text-sky-600'
                             }`}>
                               {assessment.ibLevel}
                             </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setEditingAssessmentId(assessment.id);
                            setNewAssessment({
                              name: assessment.name,
                              subject: assessment.subject,
                              maxMarks: assessment.maxMarks,
                              date: assessment.date,
                              yearGroup: assessment.yearGroup
                            });
                            setShowAssessmentModal(true);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Edit Assessment"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm(`Delete "${assessment.name}"? This will also remove all ${marks.filter(m => m.assessmentId === assessment.id).length} marks for this assessment. This cannot be undone.`)) {
                              handleDeleteAssessment(assessment.id);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete Assessment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {(() => {
                      const currentYearStudents = students.filter(s => 
                        String(s.yearGroup) === String(assessment.yearGroup) && 
                        s.academicYear === assessment.academicYear
                      );
                      const totalStudents = currentYearStudents.length;
                      const studentIdsInYear = new Set(currentYearStudents.map(s => s.id));

                      const allAssessmentMarks = marks.filter(m => 
                        m.assessmentId === assessment.id && 
                        studentIdsInYear.has(m.studentId)
                      );
                      const absentMarks = allAssessmentMarks.filter(m => (m as any).absent);
                      
                      // Only count unique students who actually sat the exam (not absent) for avg and marked count
                      const assessmentMarks = allAssessmentMarks.filter(m => !(m as any).absent);
                      
                      // Use a Map to deduplicate marks by studentId
                      const uniqueMarksMap = new Map<string, Mark>();
                      assessmentMarks.forEach(m => {
                        if (!uniqueMarksMap.has(m.studentId)) {
                          uniqueMarksMap.set(m.studentId, m);
                        }
                      });
                      
                      const markedCount = uniqueMarksMap.size;
                      const avg = markedCount > 0
                        ? Array.from(uniqueMarksMap.values()).reduce((acc, m) => acc + (m.score / assessment.maxMarks) * 100, 0) / markedCount
                        : null;
                      
                      // unmarked = students in this year group with no mark record at all
                      const uniqueAllMarksStudents = new Set(allAssessmentMarks.map(m => m.studentId));
                      const unmarkedCount = Math.max(0, totalStudents - uniqueAllMarksStudents.size);
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-50 space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-slate-50 rounded-lg p-2">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Max Marks</p>
                              <p className="text-sm font-bold text-slate-900">{assessment.maxMarks}</p>
                            </div>
                            <div className={`rounded-lg p-2 ${avg !== null ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Class Avg</p>
                              <p className={`text-sm font-bold ${avg !== null ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {avg !== null ? `${avg.toFixed(1)}%` : '—'}
                              </p>
                            </div>
                            <div className={`rounded-lg p-2 ${unmarkedCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Marked</p>
                              <p className={`text-sm font-bold ${unmarkedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {markedCount}/{totalStudents}
                              </p>
                              {absentMarks.length > 0 && (
                                <p className="text-[8px] text-rose-400 font-bold mt-0.5">{absentMarks.length} absent</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setShowMarksModal(assessment.id)}
                              className="flex-1 text-indigo-600 text-sm font-bold flex items-center justify-center gap-1 hover:gap-2 transition-all"
                            >
                              Manage Marks <ChevronRight className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setShowPaperGradingModal(assessment.id)}
                              className="flex-1 text-emerald-600 text-sm font-bold flex items-center justify-center gap-1 hover:gap-2 transition-all"
                            >
                              Grade by Question <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              {/* Data & Synchronization Section */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2 font-display">Data & Synchronization</h2>
                  <p className="text-slate-500 text-sm">Manage how your student data is stored. Access your data offline without signing in.</p>
                </div>
                
                <div className="grid gap-4">
                  <div className="card p-5 flex items-center justify-between gap-6 hover:border-indigo-200 transition-all">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 border border-sky-100">
                        <Cloud className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900">Cloud Sync (Firebase)</h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-sm">Automatically sync your data to the cloud. Turn this off to keep all student records strictly in your browser's private storage.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setUseCloudSync(!useCloudSync)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${useCloudSync ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCloudSync ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => window.location.reload()}
                      className="card p-5 text-left hover:border-indigo-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 group-hover:scale-110 transition-transform">
                          <History className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 font-display">Recover Lost Data</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Runs a deep scan of browser history to find and restore data for Years 7, 10, and 12.</p>
                    </button>

                    <button 
                      onClick={backupData}
                      className="card p-5 text-left hover:border-rose-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 group-hover:scale-110 transition-transform">
                          <Download className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 font-display">Manual Backup</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Save a physical offline backup of your tracker. Recommended before any major year transitions.</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Grade Boundaries</h2>
                  <p className="text-slate-500">Define the minimum percentage required for each grade level.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                      newBoundaries.push({ grade: 'New', minPercentage: 0 });
                      setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                    }}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Grade
                  </button>
                  <select 
                    className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedSettingScope}
                    onChange={(e) => setSelectedSettingScope(e.target.value)}
                  >
                    <optgroup label="Year Groups">
                      {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                        <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Individual Classes">
                      {groups
                        .filter(g => g.academicYear === selectedAcademicYear)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(g => (
                          <option key={g.id} value={g.name}>{g.name} (Year {g.yearGroup})</option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="card divide-y divide-slate-100">
                {(yearBoundaries[selectedSettingScope] || [])
                  .sort((a, b) => b.minPercentage - a.minPercentage)
                  .map((boundary, idx) => {
                    // Find original index for state updates
                    const originalIdx = (yearBoundaries[selectedSettingScope] || []).indexOf(boundary);
                    return (
                      <div key={idx} className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] text-slate-400 uppercase font-bold mb-1">Grade</span>
                            <input 
                              type="text"
                              className="w-14 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-bold text-indigo-600 text-center outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                              value={boundary.grade}
                              onChange={(e) => {
                                const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                newBoundaries[originalIdx].grade = e.target.value;
                                setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-500">Minimum Percentage</span>
                              <div className="flex items-center gap-1">
                                <input 
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={boundary.minPercentage}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                    newBoundaries[originalIdx].minPercentage = Math.min(100, Math.max(0, val));
                                    setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                                  }}
                                  className="w-14 px-1.5 py-0.5 text-right font-bold text-slate-900 border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                />
                                <span className="font-bold text-slate-900">%</span>
                              </div>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={boundary.minPercentage}
                              onChange={(e) => {
                                const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                newBoundaries[originalIdx].minPercentage = parseInt(e.target.value);
                                setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                              }}
                              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => setYearBoundaries(prev => ({
                            ...prev,
                            [selectedSettingScope]: prev[selectedSettingScope].filter((_, i) => i !== originalIdx)
                          }))}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                <button 
                  onClick={() => handleAddGrade(false)}
                  className="w-full p-4 text-indigo-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Grade Level
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => {
                    const newBoundaries = { ...yearBoundaries };
                    Object.keys(newBoundaries).forEach(y => {
                      if (typeof y === 'number' || !isNaN(parseInt(y as any))) newBoundaries[y] = [...KS3_BOUNDARIES];
                      else if (String(y).includes('IGCSE')) newBoundaries[y] = [...IGCSE_BOUNDARIES];
                      else if (String(y).includes('IB')) newBoundaries[y] = [...IB_BOUNDARIES];
                    });
                    setYearBoundaries(newBoundaries);
                  }}
                  className="btn-secondary text-rose-600 border-rose-100 hover:bg-rose-50"
                >
                  Reset All to Standards
                </button>
                <button 
                  onClick={() => {
                    let defaults = KS3_BOUNDARIES;
                    const scope = selectedSettingScope;
                    // Find which year group this scope belongs to
                    let yearGroup: any = scope;
                    const group = groups.find(g => g.name === scope);
                    if (group) yearGroup = group.yearGroup;

                    if (typeof yearGroup === 'string') {
                      if (yearGroup.includes('IGCSE')) defaults = IGCSE_BOUNDARIES;
                      else if (yearGroup.includes('IB')) defaults = IB_BOUNDARIES;
                    }
                    setYearBoundaries(prev => ({ ...prev, [scope]: [...defaults] }));
                  }}
                  className="btn-secondary"
                >
                  Reset Scope to Defaults
                </button>
                <button 
                  onClick={() => {
                    setSaveStatus('saving');
                    setTimeout(() => setSaveStatus('saved'), 600);
                    setTimeout(() => setSaveStatus('idle'), 3000);
                  }}
                  className="btn-primary min-w-[120px]"
                >
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
                </button>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Academic Year Transition</h2>
                    <p className="text-slate-500">Promote all students and groups to the next academic year. This will create new records for the next year without deleting any existing data.</p>
                  </div>
                </div>
                <div className="card p-6 bg-indigo-50 border-indigo-100">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-indigo-900 mb-1">Current Year: {selectedAcademicYear}</p>
                      <p className="text-xs text-indigo-700">
                        Promoting will move students to their next year group (e.g. Year 10 → Year 11). 
                        For IGCSE and IB students, their prior year data will follow them to the new year view.
                      </p>
                    </div>
                    <button 
                      onClick={handleYearTransition}
                      className="btn-primary whitespace-nowrap flex items-center gap-2"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Promote to {getNextAcademicYear(selectedAcademicYear) || 'Next Year'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Manage Groups</h2>
                    <p className="text-slate-500">View and organize classes for Year {selectedSettingScope}. Groups are automatically created when you import marks.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {groups
                    .filter(g => String(g.yearGroup) === String(selectedSettingScope) && g.academicYear === selectedAcademicYear)
                    .map((group) => (
                      <div key={group.id} className="card p-4 flex flex-col gap-3 group relative">
                        <div className="flex items-center gap-3">
                          <input 
                            type="text"
                            className="flex-1 bg-slate-100 rounded-lg px-3 py-2 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={group.name}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: newName } : g));
                              // Also update students in this group
                              setStudents(prev => prev.map(s => String(s.yearGroup) === String(group.yearGroup) && s.groupName === group.name ? { ...s, groupName: newName } : s));
                            }}
                            placeholder="Group Name"
                          />
                          <button 
                            onClick={() => handleDeleteGroup(group.id)}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Year:</span>
                          <select
                            className="text-xs bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={group.yearGroup}
                            onChange={(e) => {
                              const newYear = e.target.value as YearGroup;
                              const parsedYear = isNaN(Number(newYear)) ? newYear : Number(newYear) as YearGroup;
                              
                              setGroups(prev => prev.map(g => g.id === group.id ? { ...g, yearGroup: parsedYear } : g));
                              // Also update students in this group
                              setStudents(prev => prev.map(s => String(s.yearGroup) === String(group.yearGroup) && s.groupName === group.name ? { ...s, yearGroup: parsedYear } : s));
                            }}
                          >
                            {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                              <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                            ))}
                          </select>
                        </div>
                        {(group.yearGroup === '12 IB' || group.yearGroup === '13 IB') && (
                          <div className="flex gap-2 border-t border-slate-50 pt-2">
                            <span className="text-[9px] bg-violet-50 text-violet-600 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-violet-400"></span>
                              HL: {students.filter(s => s.groupName === group.name && String(s.yearGroup) === String(group.yearGroup) && s.ibLevel === 'HL' && s.academicYear === selectedAcademicYear).length}
                            </span>
                            <span className="text-[9px] bg-sky-50 text-sky-600 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-sky-400"></span>
                              SL: {students.filter(s => s.groupName === group.name && String(s.yearGroup) === String(group.yearGroup) && s.ibLevel === 'SL' && s.academicYear === selectedAcademicYear).length}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Bulk Data Import</h2>
                  <p className="text-slate-500">Upload a CSV file to import students, classes, and marks in one go.</p>
                </div>

                <div className="card p-6 bg-indigo-50 border-indigo-100">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">1</div>
                        <p className="font-medium">Download the template to see the required format.</p>
                      </div>
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">2</div>
                        <p className="font-medium">Fill in student names, year groups, class names, and marks.</p>
                      </div>
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">3</div>
                        <p className="font-medium">Upload the completed CSV to automatically organize your data.</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 w-full md:w-auto">
                      <button 
                        onClick={downloadTemplate}
                        className="btn-primary flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Template
                      </button>
                      <label className="btn-secondary flex items-center justify-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4" />
                        Upload Completed File
                        <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-white rounded-xl border border-indigo-100">
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 text-center">Expected CSV Headers:</h4>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['studentName', 'yearGroup', 'groupName', 'assessmentName', 'subject', 'score', 'maxMarks', 'date'].map(header => (
                        <span key={header} className="px-2 py-1 bg-slate-100 rounded text-[10px] font-mono text-slate-600 border border-slate-200">
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAssessmentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingAssessmentId ? 'Edit Assessment' : 'Add New Assessment'}
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <form id="assessment-form" onSubmit={handleAddAssessment} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Year Group</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.yearGroup}
                        onChange={e => {
                          const val = e.target.value;
                          const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                          setNewAssessment({
                            ...newAssessment, 
                            yearGroup: year,
                            subject: SUBJECTS_BY_YEAR[year][0]
                          });
                        }}
                      >
                        {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                          <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.subject}
                        onChange={e => setNewAssessment({...newAssessment, subject: e.target.value})}
                      >
                        {SUBJECTS_BY_YEAR[newAssessment.yearGroup].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* IB Level for Assessment */}
                  {(newAssessment.yearGroup === '12 IB' || newAssessment.yearGroup === '13 IB') && (
                    <div className="pb-4 border-b border-slate-100">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Scope / Level</label>
                      <div className="flex gap-2">
                        {(['all', 'HL', 'SL'] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setNewAssessment({ ...newAssessment, ibLevel: level === 'all' ? undefined : level as any })}
                            className={`flex-1 px-4 py-2 border rounded-xl font-bold transition-all ${
                              (level === 'all' && !newAssessment.ibLevel) || (newAssessment.ibLevel === level)
                                ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {level === 'all' ? 'All (Both)' : level}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">Is this assessment for a specific level or shared by both?</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newAssessment.name}
                      onChange={e => setNewAssessment({...newAssessment, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Max Marks</label>
                      <input 
                        required
                        type="number" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.maxMarks}
                        onChange={e => setNewAssessment({...newAssessment, maxMarks: parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input 
                        required
                        type="date" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.date}
                        onChange={e => setNewAssessment({...newAssessment, date: e.target.value})}
                      />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowAssessmentModal(false);
                      setEditingAssessmentId(null);
                      // We don't reset to Year 7 here anymore to preserve context
                    }} 
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button form="assessment-form" type="submit" className="btn-primary flex-1">
                    {editingAssessmentId ? 'Update Assessment' : 'Add Assessment'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showStudentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <h3 className="text-xl font-bold text-slate-900">{editingStudentId ? 'Edit Student' : 'Add New Student'}</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <form id="student-form" onSubmit={handleAddStudent} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Student Name (Legal)</label>
                    <input 
                      required
                      type="text" 
                      placeholder="e.g. Sarah Ahmed"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.name}
                      onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sarah"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.preferredName}
                      onChange={e => setNewStudent({...newStudent, preferredName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Year Group</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.yearGroup}
                      onChange={e => {
                        const val = e.target.value;
                        const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                        // Use String() comparison to avoid type mismatch, and fall back to student-derived groups
                        const groupsForYear = Array.from(new Set([
                          ...groups.filter(g => String(g.yearGroup) === String(year) && g.academicYear === selectedAcademicYear).map(g => g.name),
                          ...students.filter(s => String(s.yearGroup) === String(year) && s.academicYear === selectedAcademicYear).map(s => s.groupName).filter(Boolean)
                        ])).sort();
                        const firstGroup = groupsForYear[0] || '';
                        setNewStudent({...newStudent, yearGroup: year, groupName: firstGroup});
                      }}
                    >
                      {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                        <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Group / Class</label>
                    {(() => {
                      // Build groups list from both Firestore groups collection AND existing students
                      // Uses String() comparison to handle number/string type mismatches
                      const groupsForYear = Array.from(new Set([
                        ...groups.filter(g => String(g.yearGroup) === String(newStudent.yearGroup) && g.academicYear === selectedAcademicYear).map(g => g.name),
                        ...students.filter(s => String(s.yearGroup) === String(newStudent.yearGroup) && s.academicYear === selectedAcademicYear).map(s => s.groupName).filter(Boolean)
                      ])).sort();
                      return (
                        <select 
                          required
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                          value={newStudent.groupName}
                          onChange={e => setNewStudent({...newStudent, groupName: e.target.value})}
                        >
                          <option value="" disabled>Select Group</option>
                          {groupsForYear.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          {groupsForYear.length === 0 && (
                            <option disabled>No groups found — import students first</option>
                          )}
                        </select>
                      );
                    })()}
                  </div>

                  {(newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">IB Level (for filtering purposes)</label>
                      <div className="flex gap-2">
                        {(['HL', 'SL'] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setNewStudent({ ...newStudent, ibLevel: newStudent.ibLevel === level ? undefined : level })}
                            className={`flex-1 px-4 py-2 border rounded-xl font-bold transition-all ${
                              newStudent.ibLevel === level 
                                ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Is this student in an HL or SL class? (Optional)</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subjects</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                      {(SUBJECTS_BY_YEAR[newStudent.yearGroup] || []).map(subject => {
                        const currentSubjects: string[] = (newStudent as any).subjects || SUBJECTS_BY_YEAR[newStudent.yearGroup] || [];
                        const isSelected = currentSubjects.includes(subject);
                        return (
                          <button
                            key={subject}
                            type="button"
                            onClick={() => {
                              const current: string[] = (newStudent as any).subjects || [...(SUBJECTS_BY_YEAR[newStudent.yearGroup] || [])];
                              const updated = isSelected ? current.filter(s => s !== subject) : [...current, subject];
                              setNewStudent({...newStudent, subjects: updated} as any);
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                              isSelected 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            {subject}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Click to toggle — all selected by default</p>
                  </div>
                  {/* HL/SL level selector — only for IB years */}
                  {(newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Subject Levels (HL / SL)</label>
                      <div className="space-y-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                        {((newStudent as any).subjects || SUBJECTS_BY_YEAR[newStudent.yearGroup] || []).map((subject: string) => {
                          const subjectLevels = (newStudent as any).subjectLevels || {};
                          const currentLevel = subjectLevels[subject] || 'SL';
                          return (
                            <div key={subject} className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-700" style={{ color: SUBJECT_COLORS[subject] }}>
                                {subject}
                              </span>
                              <div className="flex gap-1">
                                {(['HL', 'SL'] as const).map(level => (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() => {
                                      const existing = (newStudent as any).subjectLevels || {};
                                      setNewStudent({ ...newStudent, subjectLevels: { ...existing, [subject]: level } } as any);
                                    }}
                                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                      currentLevel === level
                                        ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-sky-500 text-white border-sky-500'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Default is SL — click HL to change</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <div className="flex items-center h-5">
                      <input
                        id="is-new-student"
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                        checked={newStudent.isNew}
                        onChange={e => setNewStudent({ ...newStudent, isNew: e.target.checked })}
                      />
                    </div>
                    <div className="ml-0 text-sm">
                      <label htmlFor="is-new-student" className="font-bold text-indigo-900 cursor-pointer">Mark as New Student</label>
                      <p className="text-[10px] text-indigo-600/70 italic">Identify students who joined late and may have missed previous assessments.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-indigo-400" />
                      Teacher Notes / Details
                    </label>
                    <textarea
                      value={newStudent.notes}
                      onChange={e => setNewStudent({ ...newStudent, notes: e.target.value })}
                      className="input-field min-h-[80px] py-2 text-xs leading-relaxed resize-none bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                      placeholder="Add details about the student (e.g., joins from different curriculum, specific needs, etc.)"
                    />
                    <p className="text-[9px] text-slate-400 italic">These notes are only visible to teachers.</p>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowStudentModal(false);
                      setEditingStudentId(null);
                      setNewStudent(prev => ({ ...prev, name: '', preferredName: '' }));
                    }} 
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button form="student-form" type="submit" className="btn-primary flex-1">
                    {editingStudentId ? 'Save Changes' : 'Add Student'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showMarksModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="card w-full h-full md:h-[95vh] md:max-w-[95vw] p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Manage Assessment</h3>
                  <p className="text-sm text-slate-500">
                    {assessments.find(a => a.id === showMarksModal)?.name} • Max Marks: {assessments.find(a => a.id === showMarksModal)?.maxMarks}
                  </p>
                </div>
                <button onClick={() => setShowMarksModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Plus className="w-5 h-5 rotate-45 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
                <div className="lg:col-span-2 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4" /> Student Marks
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Group:</span>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          value={marksGroupFilter}
                          onChange={(e) => setMarksGroupFilter(e.target.value)}
                        >
                          <option value="all">All Groups</option>
                          {(() => {
                            const assessment = assessments.find(a => a.id === showMarksModal);
                            // Only show groups that actually have students (prevents ghost groups)
                            const fromStudents = students
                              .filter(s => assessment 
                                ? (String(s.yearGroup) === String(assessment.yearGroup) && s.academicYear === selectedAcademicYear)
                                : s.academicYear === selectedAcademicYear)
                              .map(s => s.groupName)
                              .filter(Boolean);
                            const allGroups = Array.from(new Set(fromStudents)).sort();
                            return allGroups.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ));
                          })()}
                        </select>
                      </div>
                      {(() => {
                        const assessment = assessments.find(a => a.id === showMarksModal);
                        if (!assessment || !(String(assessment.yearGroup).includes('IB'))) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">Level:</span>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                              {(['all', 'HL', 'SL'] as const).map(l => (
                                <button
                                  key={l}
                                  onClick={() => setMarksLevelFilter(l)}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                                    marksLevelFilter === l 
                                      ? 'bg-white text-indigo-600 shadow-sm' 
                                      : 'text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2">
                    {(() => {
                      const assessment = assessments.find(a => a.id === showMarksModal);
                      const relevantStudents = students.filter(s => {
                        const matchesYear = assessment ? String(s.yearGroup) === String(assessment.yearGroup) : true;
                        const matchesAcademicYear = s.academicYear === selectedAcademicYear;
                        const matchesGroup = marksGroupFilter === 'all' || s.groupName === marksGroupFilter;
                        const matchesLevel = marksLevelFilter === 'all' || s.ibLevel === marksLevelFilter;
                        return matchesYear && matchesAcademicYear && matchesGroup && matchesLevel;
                      });
                      const groupNames = Array.from(new Set(relevantStudents.map(s => s.groupName))).sort();

                      return groupNames.map(groupName => {
                        const groupStudents = relevantStudents
                          .filter(s => s.groupName === groupName)
                          .sort((a, b) => a.name.localeCompare(b.name));
                        
                        return (
                          <div key={groupName} className="mb-6">
                            <div className="flex items-center justify-between px-2 py-1 bg-slate-100 rounded-lg mb-2">
                              <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Group {groupName || 'Unassigned'}</h5>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const unmarked = groupStudents.filter(s => !marks.find(m => m.studentId === s.id && m.assessmentId === showMarksModal)).length;
                                  return unmarked > 0 ? (
                                    <span className="text-[9px] font-bold text-amber-500">{unmarked} unmarked</span>
                                  ) : (
                                    <span className="text-[9px] font-bold text-emerald-500">All marked ✓</span>
                                  );
                                })()}
                                <span className="text-[9px] text-slate-400 font-bold">{groupStudents.length} students</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {groupStudents.map(student => {
                                const mark = marks.find(m => m.studentId === student.id && m.assessmentId === showMarksModal);
                                return (
                                  <div key={student.id} className={`flex items-center justify-between p-1.5 rounded-lg border shadow-sm ${mark === undefined ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
                                    <div className="min-w-0 flex-1 mr-2">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <p className="font-bold text-slate-900 text-[11px] truncate">{student.name}</p>
                                        {/* Show HL/SL badge for the subject of this assessment */}
                                        {(() => {
                                          const assessmentSubject = assessments.find(a => a.id === showMarksModal)?.subject;
                                          const level = assessmentSubject && (student as any).subjectLevels?.[assessmentSubject];
                                          if (!level) return null;
                                          return (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                                              level === 'HL' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                                            }`}>{level}</span>
                                          );
                                        })()}
                                      </div>
                                      {mark === undefined && (
                                        <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wide">Not marked</span>
                                      )}
                                      {(mark as any)?.absent && (
                                        <span className="text-[8px] font-bold text-rose-500 uppercase tracking-wide">Absent — excluded from avg</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {/* Absent toggle */}
                                      <button
                                        type="button"
                                        title={(mark as any)?.absent ? 'Mark as present' : 'Mark as absent'}
                                        onClick={() => handleMarkAbsent(student.id, showMarksModal, !(mark as any)?.absent)}
                                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                                          (mark as any)?.absent
                                            ? 'bg-rose-500 text-white border-rose-500'
                                            : 'bg-white text-slate-300 border-slate-200 hover:text-rose-400 hover:border-rose-200'
                                        }`}
                                      >
                                        ABS
                                      </button>
                                      <input 
                                        type="number" 
                                        placeholder="Score"
                                        disabled={(mark as any)?.absent}
                                        className={`w-14 px-1.5 py-0.5 border rounded text-[11px] outline-none focus:ring-2 focus:ring-indigo-500 ${
                                          (mark as any)?.absent
                                            ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                            : mark === undefined ? 'bg-amber-50 border-amber-200 placeholder-amber-300' : 'bg-white border-slate-200'
                                        }`}
                                        value={(mark as any)?.absent ? '' : (mark?.score ?? '')}
                                        min="0"
                                        max={assessment?.maxMarks || 100}
                                        onChange={e => {
                                          const val = e.target.value;
                                          handleUpdateMark(student.id, showMarksModal, val === '' ? null : parseFloat(val));
                                        }}
                                      />
                                      <span className={`text-[9px] font-bold w-7 text-right ${
                                        (mark as any)?.absent ? 'text-rose-400' : mark === undefined ? 'text-amber-400' : 'text-slate-400'
                                      }`}>
                                        {(mark as any)?.absent ? 'ABS' : mark !== undefined ? `${((mark.score / (assessment?.maxMarks || 1)) * 100).toFixed(0)}%` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Assessment Boundaries
                  </h4>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    <p className="text-xs text-slate-500 italic">
                      Custom boundaries for this assessment. If not set, class defaults will be used.
                    </p>
                    <div className="space-y-3">
                      {(assessments.find(a => a.id === showMarksModal)?.boundaries || yearBoundaries[marksGroupFilter] || yearBoundaries[assessments.find(a => a.id === showMarksModal)?.yearGroup || 7] || [])
                        .sort((a, b) => b.minPercentage - a.minPercentage)
                        .map((boundary, idx) => {
                          const assessment = assessments.find(a => a.id === showMarksModal)!;
                          const sourceBoundaries = assessment.boundaries || yearBoundaries[marksGroupFilter] || yearBoundaries[assessment.yearGroup] || [];
                          const originalIdx = sourceBoundaries.indexOf(boundary);

                          return (
                            <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] text-slate-400 uppercase font-bold mb-0.5">Grade</span>
                                <input 
                                  type="text"
                                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-center text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                  value={boundary.grade}
                                  onChange={(e) => {
                                    const currentBoundaries = [...sourceBoundaries];
                                    currentBoundaries[originalIdx].grade = e.target.value;
                                    setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                  }}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-slate-500">Min %</span>
                                  <div className="flex items-center gap-1">
                                    <input 
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={boundary.minPercentage}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        const currentBoundaries = [...sourceBoundaries];
                                        currentBoundaries[originalIdx].minPercentage = Math.min(100, Math.max(0, val));
                                        setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                      }}
                                      className="w-12 px-1 py-0.5 text-right font-bold text-slate-900 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500 text-[10px]"
                                    />
                                    <span className="font-bold text-slate-900 text-[10px]">%</span>
                                  </div>
                                </div>
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="100" 
                                  value={boundary.minPercentage}
                                  onChange={(e) => {
                                    const currentBoundaries = [...sourceBoundaries];
                                    currentBoundaries[originalIdx].minPercentage = parseInt(e.target.value);
                                    setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                  }}
                                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                              </div>
                              <button 
                                onClick={() => {
                                  const currentBoundaries = sourceBoundaries.filter((_, i) => i !== originalIdx);
                                  setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                }}
                                className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      <button 
                        onClick={() => handleAddGrade(true, showMarksModal)}
                        className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-indigo-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Grade Level
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <AlertCircle className="w-3 h-3" />
                  <span>Note: Students marked as <strong>ABS</strong> (Absent) are excluded from all average calculations.</span>
                </div>
                <button onClick={() => setShowMarksModal(null)} className="btn-primary px-8">Save and Close</button>
              </div>
            </motion.div>
          </div>
        )}
        {showPaperGradingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      Question-Level Grading: {assessments.find(a => a.id === showPaperGradingModal)?.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {assessments.find(a => a.id === showPaperGradingModal)?.subject} • {formatYearGroup(assessments.find(a => a.id === showPaperGradingModal)?.yearGroup || 7)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPaperGradingModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-6">
                {!assessments.find(a => a.id === showPaperGradingModal)?.questions ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                    <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-6">
                      <Upload className="w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 mb-2">Upload Exam Paper</h4>
                    <p className="text-slate-500 max-w-md mb-8">
                      Upload the exam paper (PDF or Image) and AI will automatically extract question numbers and their maximum marks.
                    </p>

                    <div className="flex items-center gap-4 mb-8 p-1 bg-slate-100 rounded-2xl w-full max-w-md">
                      <button 
                        onClick={() => setExtractionMode('questions')}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${extractionMode === 'questions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Main Questions Only
                      </button>
                      <button 
                        onClick={() => setExtractionMode('subparts')}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${extractionMode === 'subparts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Include Sub-parts (1a, 1b)
                      </button>
                    </div>
                    
                    <label className="btn-primary cursor-pointer flex items-center gap-2 px-8">
                      {isExtracting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Extracting Questions...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Select Paper to Extract
                        </>
                      )}
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*,application/pdf"
                        disabled={isExtracting}
                        onChange={(e) => handlePaperUpload(e, showPaperGradingModal)}
                      />
                    </label>

                    {extractionError && (
                      <div className="mt-6 flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{extractionError}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {assessments.find(a => a.id === showPaperGradingModal)?.questions?.length} Questions Extracted
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-600">
                          Total Marks: <span className="text-slate-900">{assessments.find(a => a.id === showPaperGradingModal)?.maxMarks}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Group</span>
                          <select 
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            value={modalGroupFilter}
                            onChange={(e) => setModalGroupFilter(e.target.value)}
                          >
                            <option value="all">All Groups</option>
                            {Array.from(new Set(students
                              .filter(s => s.academicYear === selectedAcademicYear && s.yearGroup === assessments.find(a => a.id === showPaperGradingModal)?.yearGroup)
                              .map(s => s.groupName)
                            )).sort().map(g => (
                              <option key={g} value={g}>{g || 'Unassigned'}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                          <button 
                            onClick={() => setExtractionMode('questions')}
                            className={`py-1 px-3 rounded-lg text-[10px] font-bold transition-all ${extractionMode === 'questions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            Questions
                          </button>
                          <button 
                            onClick={() => setExtractionMode('subparts')}
                            className={`py-1 px-3 rounded-lg text-[10px] font-bold transition-all ${extractionMode === 'subparts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            Sub-parts
                          </button>
                        </div>
                        <label className="text-xs text-indigo-600 font-bold cursor-pointer hover:underline flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          Re-upload Paper
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*,application/pdf"
                            onChange={(e) => handlePaperUpload(e, showPaperGradingModal)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
                      <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[200px]">Student Name</th>
                            {assessments.find(a => a.id === showPaperGradingModal)?.questions?.map(q => (
                              <th key={q.number} className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center min-w-[80px]">
                                Q{q.number}
                                <div className="text-[8px] font-normal text-slate-400">/{q.maxMarks}</div>
                              </th>
                            ))}
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[100px]">Total Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const assessment = assessments.find(a => a.id === showPaperGradingModal)!;
                            const relevantStudents = students.filter(s => 
                              s.academicYear === selectedAcademicYear && 
                              s.yearGroup === assessment.yearGroup &&
                              (modalGroupFilter === 'all' || s.groupName === modalGroupFilter)
                            );
                            const groupNames = Array.from(new Set(relevantStudents.map(s => s.groupName))).sort();
                            
                            return groupNames.map(groupName => {
                              const groupStudents = relevantStudents
                                .filter(s => s.groupName === groupName)
                                .sort((a, b) => a.name.localeCompare(b.name));
                              
                              return (
                                <React.Fragment key={groupName}>
                                  <tr className="bg-slate-50/50">
                                    <td 
                                      colSpan={(assessment.questions?.length || 0) + 2} 
                                      className="px-4 py-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-widest border-y border-slate-100"
                                    >
                                      Group {groupName || 'Unassigned'}
                                    </td>
                                  </tr>
                                  {groupStudents.map(student => {
                                    const mark = marks.find(m => m.studentId === student.id && m.assessmentId === showPaperGradingModal);
                                    return (
                                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-4 py-3">
                                          <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                                        </td>
                                        {assessment.questions?.map(q => (
                                          <td key={q.number} className="px-3 py-3 text-center">
                                            <input 
                                              type="number"
                                              min="0"
                                              max={q.maxMarks}
                                              className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-center font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                              value={mark?.questionScores?.[q.number] ?? ''}
                                              onChange={(e) => updateQuestionScore(student.id, assessment.id, q.number, parseFloat(e.target.value) || 0)}
                                            />
                                          </td>
                                        ))}
                                        <td className="px-4 py-3 text-right">
                                          <div className="flex flex-col items-end">
                                            <span className="text-sm font-bold text-indigo-600">
                                              {mark?.score ?? 0} / {assessment.maxMarks}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400">
                                              {mark ? ((mark.score / assessment.maxMarks) * 100).toFixed(1) : '0.0'}%
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button 
                  onClick={() => setShowPaperGradingModal(null)}
                  className="btn-primary px-8"
                >
                  Save and Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Confirm Import</h3>
                    <p className="text-sm text-slate-500">File: {pendingImport?.fileName}.csv</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Year</label>
                  <select 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                    value={selectedAcademicYear}
                    onChange={e => setSelectedAcademicYear(e.target.value)}
                  >
                    {ACADEMIC_YEARS.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Year Group</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      value={importConfig.yearGroup}
                      onChange={e => {
                        const val = e.target.value;
                        const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                        setImportConfig({ ...importConfig, yearGroup: year, subject: SUBJECTS_BY_YEAR[year][0] });
                      }}
                    >
                      {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                        <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Class Name</label>
                    {importPreview && importPreview.groups && importPreview.groups.length > 0 ? (
                      <div className="w-full px-4 py-2 border border-green-300 bg-green-50 rounded-xl text-green-700 font-bold text-sm flex items-center gap-2">
                        <span>✓ Auto-detected: {importPreview.groups.join(', ')}</span>
                      </div>
                    ) : (
                      <input 
                        type="text"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                        value={importConfig.groupName}
                        onChange={e => setImportConfig({ ...importConfig, groupName: e.target.value })}
                        placeholder="e.g. 10A"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Assessment Name</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                    value={importConfig.assessmentName}
                    onChange={e => setImportConfig({ ...importConfig, assessmentName: e.target.value })}
                    placeholder="e.g. End of Term Test"
                    disabled={importConfig.assessmentName.includes('Multiple')}
                  />
                  {importConfig.assessmentName.includes('Multiple') && (
                    <p className="text-[10px] text-indigo-600 mt-1 font-medium">
                      ✨ Multi-assessment detected! The system will use names from your CSV.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Subject</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      value={importConfig.subject}
                      onChange={e => setImportConfig({ ...importConfig, subject: e.target.value })}
                    >
                      {SUBJECTS_BY_YEAR[importConfig.yearGroup].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Max Marks</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      value={importConfig.maxMarks}
                      onChange={e => setImportConfig({ ...importConfig, maxMarks: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Date</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                    value={importConfig.date}
                    onChange={e => setImportConfig({ ...importConfig, date: e.target.value })}
                  />
                </div>

                {/* Preview panel */}
                {importPreview && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Import Preview</p>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-white rounded-lg p-2 border border-indigo-100">
                        <p className="text-lg font-bold text-indigo-600">{importPreview.students}</p>
                        <p className="text-[10px] text-slate-500">Students</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-indigo-100">
                        <p className="text-lg font-bold text-indigo-600">{importPreview.marks}</p>
                        <p className="text-[10px] text-slate-500">Marks</p>
                      </div>
                    </div>
                    {importPreview.groups && importPreview.groups.length > 0 && (
                      <div className="bg-white rounded-lg p-2 border border-green-200">
                        <p className="text-[10px] font-bold text-green-700 mb-1">GROUPS DETECTED</p>
                        <div className="flex flex-wrap gap-1">
                          {importPreview.groups.map(g => (
                            <span key={g} className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-bold">{g}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(importColumnSubjects).length > 0 ? (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                          Assessments detected — assign a subject to each:
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {Object.entries(importColumnSubjects).map(([col, subject]) => {
                            // Parse name and maxMarks from column header for display
                            const marksMatch = col.match(/\((\d+)\)/);
                            const maxMarks = marksMatch ? parseInt(marksMatch[1]) : importConfig.maxMarks;
                            let displayName = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
                            // Strip subject suffix if auto-detected
                            const dashMatch = displayName.match(/^(.+?)\s*[-–—]\s*(.+)$/);
                            if (dashMatch) displayName = dashMatch[1].trim();
                            return (
                              <div key={col} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-indigo-100">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold text-slate-800 truncate">{displayName}</p>
                                  <p className="text-[9px] text-slate-400">{maxMarks} marks</p>
                                </div>
                                <select
                                  className={`text-[10px] font-bold border rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400 ${
                                    !subject ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  }`}
                                  value={subject}
                                  onChange={e => setImportColumnSubjects(prev => ({ ...prev, [col]: e.target.value }))}
                                >
                                  <option value="">— pick subject —</option>
                                  {SUBJECTS_BY_YEAR[importConfig.yearGroup].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        {Object.values(importColumnSubjects).some(s => !s) && (
                          <p className="text-[10px] text-amber-600 mt-1.5 font-medium">
                            ⚠ Assign a subject to every assessment before importing.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                        ⚠ No assessment columns detected. Check column headers include max marks e.g. "Test 1 (50)".
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setShowImportModal(false); setPendingImport(null); setImportPreview(null); }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={previewImport}
                    className="btn-secondary flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  >
                    Preview
                  </button>
                  <button 
                    onClick={() => { confirmImport(); setImportPreview(null); setImportColumnSubjects({}); }}
                    className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={
                      !importPreview ||
                      Object.keys(importColumnSubjects).length === 0 ||
                      Object.values(importColumnSubjects).some(s => !s)
                    }
                  >
                    Import
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <footer className="bg-white border-t border-slate-200 py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Pooja Arora. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
