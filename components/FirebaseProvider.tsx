import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, User, signInWithPopup, googleProvider, signOut, handleFirestoreError, OperationType, collection, query, where, onSnapshot, Timestamp, doc, setDoc } from '../firebase';
import { GeneralData } from '../types';

interface Project {
  id: string;
  userId: string;
  projectName: string;
  section: string;
  createdAt: any;
  updatedAt: any;
  generalData: GeneralData;
  compositionData?: number[];
  axleInputs?: any[];
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  projects: Project[];
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      
      if (user) {
        // Save user profile
        try {
          const userDoc = doc(db, 'users', user.uid);
          await setDoc(userDoc, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            updatedAt: Timestamp.now()
          }, { merge: true });
        } catch (error) {
          console.error("Error saving user profile", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    // If user is admin (incimoc@gmail.com), show all projects. 
    // Otherwise only show their own projects.
    const q = (user.email === 'incimoc@gmail.com')
      ? query(collection(db, 'projects'))
      : query(collection(db, 'projects'), where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projectsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return () => unsubscribe();
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Inicio de sesión cancelado por el usuario.");
      } else if (error.code === 'auth/popup-blocked') {
        alert("El navegador bloqueó la ventana de inicio de sesión. Por favor, permite las ventanas emergentes para esta aplicación.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log("Solicitud de ventana emergente cancelada.");
      } else {
        console.error("Error de inicio de sesión:", error);
        alert("Error al iniciar sesión: " + (error.message || "Error desconocido"));
      }
      return false;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, projects, login, logout }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
