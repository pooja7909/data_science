import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, query, where, getDoc } from 'firebase/firestore';
import { Student, Assessment, Mark, Group, GradeBoundary } from '../types';
import { auth } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { doc, setDoc };

export const getStudents = async () => {
  try {
    if (!auth.currentUser) return [];
    const q = query(collection(db, 'students'), where('teacherId', '==', auth.currentUser.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'students');
  }
};

export const addStudent = async (student: Omit<Student, 'id' | 'teacherId'>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    return await addDoc(collection(db, 'students'), {
      ...student,
      teacherId: auth.currentUser.uid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
};

export const updateStudent = async (id: string, student: Partial<Student>) => {
  try {
    await updateDoc(doc(db, 'students', id), student);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
  }
};

export const deleteStudent = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'students', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
  }
};

export const getAssessments = async () => {
  try {
    if (!auth.currentUser) return [];
    const q = query(collection(db, 'assessments'), where('teacherId', '==', auth.currentUser.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'assessments');
  }
};

export const addAssessment = async (assessment: Omit<Assessment, 'id' | 'teacherId'>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    return await addDoc(collection(db, 'assessments'), {
      ...assessment,
      teacherId: auth.currentUser.uid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'assessments');
  }
};

export const updateAssessment = async (id: string, assessment: Partial<Assessment>) => {
  try {
    await updateDoc(doc(db, 'assessments', id), assessment);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `assessments/${id}`);
  }
};

export const deleteAssessment = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'assessments', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assessments/${id}`);
  }
};

export const getMarks = async () => {
  try {
    if (!auth.currentUser) return [];
    const q = query(collection(db, 'marks'), where('teacherId', '==', auth.currentUser.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Mark));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'marks');
  }
};

export const addMark = async (mark: Omit<Mark, 'id' | 'teacherId'>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    return await addDoc(collection(db, 'marks'), {
      ...mark,
      teacherId: auth.currentUser.uid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'marks');
  }
};

export const updateMark = async (id: string, mark: Partial<Mark>) => {
  try {
    await updateDoc(doc(db, 'marks', id), mark);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `marks/${id}`);
  }
};

export const deleteMark = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'marks', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `marks/${id}`);
  }
};

export const getGroups = async () => {
  try {
    if (!auth.currentUser) return [];
    const q = query(collection(db, 'groups'), where('teacherId', '==', auth.currentUser.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groups');
  }
};

export const addGroup = async (group: Omit<Group, 'id' | 'teacherId'>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    return await addDoc(collection(db, 'groups'), {
      ...group,
      teacherId: auth.currentUser.uid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'groups');
  }
};

export const updateGroup = async (id: string, group: Partial<Group>) => {
  try {
    await updateDoc(doc(db, 'groups', id), group);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${id}`);
  }
};

export const deleteGroup = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'groups', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${id}`);
  }
};

export const getYearBoundaries = async () => {
  try {
    if (!auth.currentUser) return null;
    const boundariesDoc = await getDoc(doc(db, 'config', auth.currentUser.uid));
    return boundariesDoc.exists() ? boundariesDoc.data() as Record<string, GradeBoundary[]> : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'config');
  }
};

export const updateYearBoundaries = async (boundaries: Record<string, GradeBoundary[]>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    await setDoc(doc(db, 'config', auth.currentUser.uid), boundaries);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'config');
  }
};
