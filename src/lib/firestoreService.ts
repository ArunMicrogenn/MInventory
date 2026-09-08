import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

export const subscribeToCollection = <T>(
  collectionName: string, 
  callback: (data: T[]) => void,
  onError?: (error: any) => void
) => {
  return onSnapshot(
    collection(db, collectionName), 
    (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      callback(data);
    },
    (err) => {
      console.warn(`Firestore subscription to [${collectionName}] notice:`, err.message || err);
      if (onError) onError(err);
    }
  );
};

export const updateDocument = async (collectionName: string, id: string, data: any) => {
  try {
    await setDoc(doc(db, collectionName, id), data, { merge: true });
  } catch (err) {
    console.warn(`Firestore update failed for [${collectionName}/${id}]:`, err);
  }
};

export const deleteDocument = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (err) {
    console.warn(`Firestore delete failed for [${collectionName}/${id}]:`, err);
  }
};
