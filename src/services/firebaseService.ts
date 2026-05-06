import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, query, where, getDoc, onSnapshot } from 'firebase/firestore';
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

export const getMarkId = (studentId: string, assessmentId: string) => `mark_${studentId}_${assessmentId}`;

export const subscribeToData = (
  collectionName: string, 
  callback: (data: any[]) => void
) => {
  if (!auth.currentUser) return () => {};
  
  const q = query(collection(db, collectionName));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, collectionName);
  });
};

export const getStudents = async () => {
  try {
    if (!auth.currentUser) return [];
    const q = query(collection(db, 'students'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'students');
  }
};

export const addStudent = async (student: Student) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    const id = student.id || Math.random().toString(36).substr(2, 9);
    const data = {
      ...student,
      id,
      createdBy: auth.currentUser.uid,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'students', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
};

export const updateStudent = async (id: string, student: Partial<Student>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    await updateDoc(doc(db, 'students', id), {
      ...student,
      lastUpdatedBy: auth.currentUser.uid,
      updatedAt: new Date().toISOString()
    });
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
    const q = query(collection(db, 'assessments'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'assessments');
  }
};

export const addAssessment = async (assessment: Assessment) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    const id = assessment.id || Math.random().toString(36).substr(2, 9);
    const data = {
      ...assessment,
      id,
      createdBy: auth.currentUser.uid,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'assessments', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'assessments');
  }
};

export const updateAssessment = async (id: string, assessment: Partial<Assessment>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    await updateDoc(doc(db, 'assessments', id), {
      ...assessment,
      lastUpdatedBy: auth.currentUser.uid,
      updatedAt: new Date().toISOString()
    });
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
    const q = query(collection(db, 'marks'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Mark));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'marks');
  }
};

export const setMark = async (mark: Mark) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    const id = mark.id || getMarkId(mark.studentId, mark.assessmentId);
    
    // In a shared team environment, we prioritize syncing over individual ownership
    const data = {
      ...mark,
      id,
      lastUpdatedBy: auth.currentUser.uid,
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'marks', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'marks');
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
    const q = query(collection(db, 'groups'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groups');
  }
};

export const addGroup = async (group: Group) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    const id = group.id || Math.random().toString(36).substr(2, 9);
    const data = {
      ...group,
      id,
      createdBy: auth.currentUser.uid,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'groups', id), data);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'groups');
  }
};

export const updateGroup = async (id: string, group: Partial<Group>) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    await updateDoc(doc(db, 'groups', id), {
      ...group,
      lastUpdatedBy: auth.currentUser.uid,
      updatedAt: new Date().toISOString()
    });
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

export const subscribeToConfig = (callback: (data: any) => void) => {
  if (!auth.currentUser) return () => {};
  return onSnapshot(doc(db, 'config', 'shared_settings'), (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'config/shared_settings');
  });
};

export const getYearBoundaries = async () => {
  try {
    if (!auth.currentUser) return null;
    const boundariesDoc = await getDoc(doc(db, 'config', 'shared_settings'));
    return boundariesDoc.exists() ? boundariesDoc.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'config');
  }
};

export const updateYearBoundaries = async (data: any) => {
  try {
    if (!auth.currentUser) throw new Error("Logged in user required");
    await setDoc(doc(db, 'config', 'shared_settings'), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'config');
  }
};
