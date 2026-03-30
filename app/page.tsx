'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Printer, Save, Sparkles, FileText, User, Clock, CheckCircle2, Loader2, Calendar, BarChart3, History, Activity, XCircle } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { MEDICINE_DB, MedDBItem } from '@/lib/medicines';

type PatientStatus = 'waiting' | 'active' | 'completed';

interface Medicine {
  id: string;
  name: string;
  dose: string;
  freq: string;
  duration: string;
}

interface Vitals {
  weight: string;
  height: string;
  temp: string;
  pulse: string;
  bp: string;
  spo2: string;
}

interface PastHistory {
  diabetes: boolean;
  hypertension: boolean;
  asthma: boolean;
  thyroid: boolean;
  allergies: boolean;
  pastSurgeries: boolean;
  notes: string;
}

interface Patient {
  id: string;
  name: string;
  dob: string;
  age: number;
  ageMonths?: number;
  gender: 'M' | 'F' | 'O';
  mobile: string;
  address: string;
  visitCount: number;
  status: PatientStatus;
  symptoms: string;
  diagnosis: string;
  notes: string;
  labTests: string;
  vitals: Vitals;
  pastHistory: PastHistory;
  prescription: Medicine[];
}

interface Appointment {
  id: string;
  patientName: string;
  mobile: string;
  date: string;
  time: string;
  reason: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

const defaultVitals: Vitals = { weight: '', height: '', temp: '', pulse: '', bp: '', spo2: '' };
const defaultHistory: PastHistory = { diabetes: false, hypertension: false, asthma: false, thyroid: false, allergies: false, pastSurgeries: false, notes: '' };

const initialPatients: Patient[] = [
  { id: '1', name: 'Rahul Sharma', dob: '1981-01-01', age: 45, ageMonths: 0, gender: 'M', mobile: '9876543210', address: 'Mumbai', visitCount: 3, status: 'waiting', symptoms: 'Fever and cough since 2 days', diagnosis: '', notes: '', labTests: '', vitals: defaultVitals, pastHistory: defaultHistory, prescription: [] },
  { id: '2', name: 'Priya Patel', dob: '1994-01-01', age: 32, ageMonths: 0, gender: 'F', mobile: '9876543211', address: 'Pune', visitCount: 1, status: 'waiting', symptoms: 'Headache and nausea', diagnosis: '', notes: '', labTests: '', vitals: defaultVitals, pastHistory: defaultHistory, prescription: [] },
  { id: '3', name: 'Amit Kumar', dob: '1998-01-01', age: 28, ageMonths: 0, gender: 'M', mobile: '9876543212', address: 'Delhi', visitCount: 5, status: 'waiting', symptoms: 'Stomach ache after eating outside food', diagnosis: '', notes: '', labTests: '', vitals: defaultVitals, pastHistory: defaultHistory, prescription: [] },
  { id: '4', name: 'Sunita Devi', dob: '1971-01-01', age: 55, ageMonths: 0, gender: 'F', mobile: '9876543213', address: 'Bangalore', visitCount: 12, status: 'waiting', symptoms: 'Joint pain in knees', diagnosis: '', notes: '', labTests: '', vitals: defaultVitals, pastHistory: defaultHistory, prescription: [] },
];

const COMMON_MEDS = ['Paracetamol 500mg', 'Azithromycin 500mg', 'Amoxiclav 625mg', 'Pantoprazole 40mg', 'Cetirizine 10mg', 'Ibuprofen 400mg', 'Ondansetron 4mg', 'Metformin 500mg'];
const FREQ_PRESETS = ['OD', 'BD', 'TDS', 'QID', 'SOS'];
const COMMON_DIAGNOSES = ['Viral Fever', 'Common Cold', 'Hypertension', 'Diabetes', 'Gastritis'];
const COMMON_SYMPTOMS = ['Fever', 'Cough', 'Cold', 'Headache', 'Body Ache', 'Nausea', 'Vomiting', 'Diarrhea', 'Stomach Ache', 'Weakness', 'Dizziness', 'Sore Throat'];

const calculateAge = (dob: string) => {
  if (!dob) return { years: 0, months: 0 };
  const birthDate = new Date(dob);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
    years--;
    months += 12;
  }
  if (today.getDate() < birthDate.getDate()) {
    months--;
    if (months < 0) {
      months += 12;
    }
  }
  return { years: Math.max(0, years), months: Math.max(0, months) };
};

const formatAge = (years: number, months?: number) => {
  if (years === 0 && months) return `${months} M`;
  if (years > 0 && months) return `${years} Y ${months} M`;
  return `${years} Y`;
};

const getPatientType = (age: number) => age < 14 ? 'Pediatric' : 'Adult';

const isAbnormal = (field: keyof Vitals, value: string) => {
  if (!value) return false;
  const num = parseFloat(value);
  if (isNaN(num) && field !== 'bp') return false;
  switch (field) {
    case 'temp': return num > 99;
    case 'pulse': return num < 60 || num > 100;
    case 'spo2': return num < 95;
    case 'bp': 
      const [sys, dia] = value.split('/').map(Number);
      if (sys && dia) return sys > 140 || dia > 90 || sys < 90 || dia < 60;
      return false;
    default: return false;
  }
};

const MedicineAutocomplete = ({
  id,
  value,
  patientType,
  patientWeight,
  patientAge,
  onChange,
  onSelect,
  onEnter
}: {
  id: string;
  value: string;
  patientType: 'Pediatric' | 'Adult';
  patientWeight?: string;
  patientAge: number;
  onChange: (val: string) => void;
  onSelect?: (med: MedDBItem) => void;
  onEnter: (e: React.KeyboardEvent<HTMLElement>) => void;
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const weightNum = parseFloat(patientWeight || '');
  const isUnder20kg = patientType === 'Pediatric' && ((!isNaN(weightNum) && weightNum < 20) || (isNaN(weightNum) && patientAge < 6));

  const filtered = value 
    ? MEDICINE_DB.filter(m => {
        if (isUnder20kg) {
          const form = m.form.toLowerCase();
          if (form.includes('tablet') || form.includes('capsule') || form.includes('tab') || form.includes('cap')) {
            return false;
          }
        }

        const searchTerms = value.toLowerCase().trim().split(/\s+/);
        const combined = `${m.name} ${m.strength} ${m.form}`.toLowerCase();
        
        // 1. Exact match for all typed words (e.g., "para 500" or "500 syrup")
        if (searchTerms.every(term => combined.includes(term))) return true;
        
        // 2. Fuzzy match for initials/shorthand (e.g., "pcm500" -> "paracetamol 500mg")
        const searchNoSpaces = value.toLowerCase().replace(/\s+/g, '');
        const combinedNoSpaces = combined.replace(/\s+/g, '');
        
        let i = 0, j = 0;
        while (i < searchNoSpaces.length && j < combinedNoSpaces.length) {
          if (searchNoSpaces[i] === combinedNoSpaces[j]) i++;
          j++;
        }
        return i === searchNoSpaces.length;
      }).slice(0, 15)
    : [];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && filtered.length > 0 && value) {
        const selected = filtered[activeIndex];
        onChange(`${selected.name} ${selected.strength} ${selected.form}`);
        if (onSelect) onSelect(selected);
        setShowSuggestions(false);
        setTimeout(() => onEnter(e), 0);
      } else {
        onEnter(e);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
          setActiveIndex(0);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder="Drug Name"
        autoComplete="off"
        className="w-full bg-transparent font-bold text-sm outline-none mb-2 placeholder-gray-300"
      />
      {showSuggestions && value && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto top-full mt-1 left-0">
          {filtered.map((med, idx) => (
            <li
              key={`${med.name}-${med.strength}-${med.form}-${idx}`}
              className={`px-3 py-2 cursor-pointer border-b border-gray-50 last:border-0 ${idx === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(`${med.name} ${med.strength} ${med.form}`);
                if (onSelect) onSelect(med);
                setShowSuggestions(false);
                setTimeout(() => {
                  const focusableElements = document.querySelectorAll(
                    'input:not([disabled]), textarea:not([disabled])'
                  );
                  const index = Array.from(focusableElements).indexOf(document.getElementById(id) as Element);
                  if (index > -1 && index + 1 < focusableElements.length) {
                    (focusableElements[index + 1] as HTMLElement).focus();
                  }
                }, 0);
              }}
            >
              <div className={`text-sm ${idx === activeIndex ? 'text-blue-700 font-bold' : 'text-gray-900 font-semibold'}`}>
                {med.name}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600">{med.form}</span>
                <span>{med.strength}</span>
                <span className="ml-auto text-blue-600 font-medium text-[10px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {patientType === 'Pediatric' && med.pediatricDose && med.pediatricDose !== 'Not recommended' ? med.pediatricDose : med.adultDose}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function OPDSystem() {
  type Tab = 'opd' | 'calendar' | 'analytics' | 'history';
  const [activeTab, setActiveTab] = useState<Tab>('opd');
  
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const symptomsRef = useRef<HTMLTextAreaElement>(null);

  const activePatient = patients.find(p => p.id === activeId);

  // Reset edit mode when patient changes
  useEffect(() => {
    setIsEditingProfile(false);
  }, [activeId]);

  // Auto-focus symptoms when patient changes
  useEffect(() => {
    if (activeId) {
      setTimeout(() => {
        symptomsRef.current?.focus();
      }, 50);
    }
  }, [activeId]);

  // Auto-save to localStorage
  useEffect(() => {
    const timer = setInterval(() => {
      localStorage.setItem('navjeevan_patients', JSON.stringify(patients));
      localStorage.setItem('navjeevan_appointments', JSON.stringify(appointments));
    }, 2000);
    return () => clearInterval(timer);
  }, [patients, appointments]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedPatients = localStorage.getItem('navjeevan_patients');
    if (savedPatients) {
      try {
        const parsed = JSON.parse(savedPatients);
        const migrated = parsed.map((p: any) => ({
          ...p,
          vitals: p.vitals || { weight: '', height: '', temp: '', pulse: '', bp: '', spo2: '' },
          pastHistory: p.pastHistory || { diabetes: false, hypertension: false, asthma: false, thyroid: false, allergies: false, pastSurgeries: false, notes: '' },
          dob: p.dob || '',
          address: p.address || '',
          ageMonths: p.ageMonths || 0
        }));
        setPatients(migrated);
      } catch (e) {
        console.error('Failed to parse saved patients', e);
      }
    }
    
    const savedAppointments = localStorage.getItem('navjeevan_appointments');
    if (savedAppointments) {
      try {
        setAppointments(JSON.parse(savedAppointments));
      } catch (e) {
        console.error('Failed to parse saved appointments', e);
      }
    }
  }, []);



  const updateActivePatient = (updates: Partial<Patient>) => {
    if (!activeId) return;
    setPatients(prev => prev.map(p => p.id === activeId ? { ...p, ...updates } : p));
  };

  const handlePatientClick = (id: string) => {
    setActiveId(id);
    setPatients(prev => prev.map(p => {
      if (p.id === id && p.status === 'waiting') return { ...p, status: 'active' };
      if (p.id !== id && p.status === 'active') return { ...p, status: 'waiting' };
      return p;
    }));
  };

  const handleSaveAndNext = useCallback(() => {
    if (!activeId) return;
    
    let nextId: string | null = null;
    let foundCurrent = false;
    
    let updatedPatients = patients.map(p => {
      if (p.id === activeId) {
        foundCurrent = true;
        return { ...p, status: 'completed' as PatientStatus };
      }
      if (foundCurrent && !nextId && p.status === 'waiting') {
        nextId = p.id;
      }
      return p;
    });

    // If no next waiting patient found after current, look from beginning
    if (!nextId) {
      const firstWaiting = updatedPatients.find(p => p.status === 'waiting');
      if (firstWaiting) nextId = firstWaiting.id;
    }

    if (nextId) {
      updatedPatients = updatedPatients.map(p => {
        if (p.id === nextId && p.status === 'waiting') return { ...p, status: 'active' as PatientStatus };
        return p;
      });
      setActiveId(nextId);
    } else {
      setActiveId(null);
    }
    
    setPatients(updatedPatients);
  }, [activeId, patients]);

  const handleAddPatient = useCallback(() => {
    const newPatient: Patient = {
      id: Date.now().toString(),
      name: 'New Patient',
      dob: '',
      age: 30,
      ageMonths: 0,
      gender: 'M',
      mobile: '',
      address: '',
      visitCount: 1,
      status: 'active',
      symptoms: '',
      diagnosis: '',
      notes: '',
      labTests: '',
      vitals: { weight: '', height: '', temp: '', pulse: '', bp: '', spo2: '' },
      pastHistory: { diabetes: false, hypertension: false, asthma: false, thyroid: false, allergies: false, pastSurgeries: false, notes: '' },
      prescription: []
    };
    setPatients(prev => prev.map(p => p.status === 'active' ? { ...p, status: 'waiting' as PatientStatus } : p).concat(newPatient));
    setActiveId(newPatient.id);
    setIsEditingProfile(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveAndNext();
      }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleAddPatient();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, patients, handleSaveAndNext, handleAddPatient]);

  const addMedicineRow = () => {
    if (!activePatient) return;
    const newMed: Medicine = { id: Date.now().toString(), name: '', dose: '', freq: '', duration: '' };
    updateActivePatient({ prescription: [...activePatient.prescription, newMed] });
  };

  const updateMedicine = (id: string, field: keyof Medicine, value: string) => {
    if (!activePatient) return;
    updateActivePatient({
      prescription: activePatient.prescription.map(m => m.id === id ? { ...m, [field]: value } : m)
    });
  };

  const removeMedicine = (id: string) => {
    if (!activePatient) return;
    updateActivePatient({
      prescription: activePatient.prescription.filter(m => m.id !== id)
    });
  };

  // Generic Enter key handler to move to next input
  const handleEnterKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const focusableElements = document.querySelectorAll(
        'input:not([disabled]), textarea:not([disabled])'
      );
      const index = Array.from(focusableElements).indexOf(e.target as Element);
      if (index > -1 && index + 1 < focusableElements.length) {
        (focusableElements[index + 1] as HTMLElement).focus();
      }
    }
  };

  const handleMedicineDaysEnter = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!activePatient) return;
      
      if (index === activePatient.prescription.length - 1) {
        addMedicineRow();
        setTimeout(() => {
          document.getElementById(`med-name-${index + 1}`)?.focus();
        }, 50);
      } else {
        document.getElementById(`med-name-${index + 1}`)?.focus();
      }
    }
  };

  const suggestRx = async () => {
    if (!activePatient?.symptoms) return;
    setIsSuggesting(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API key missing");
      
      const ai = new GoogleGenAI({ apiKey });
      
      const pastHistoryStr = Object.entries(activePatient.pastHistory || {})
        .filter(([k, v]) => v === true && k !== 'notes')
        .map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase())
        .join(', ');
        
      const weightNum = parseFloat(activePatient.vitals?.weight || '');
      const isUnder20kg = getPatientType(activePatient.age) === 'Pediatric' && ((!isNaN(weightNum) && weightNum < 20) || (isNaN(weightNum) && activePatient.age < 6));

      const prompt = `You are Dr. GPT Zen MD, an elite, highly empathetic, and holistic Senior Consultant Physician in India. Your approach is evidence-based, patient-centered, and avoids unnecessary medications (especially antibiotics). You focus on treating the root cause, providing clear differential diagnoses, and offering holistic lifestyle/dietary advice alongside standard allopathic treatment.

Patient Profile: ${formatAge(activePatient.age, activePatient.ageMonths)} old ${activePatient.gender === 'M' ? 'Male' : activePatient.gender === 'F' ? 'Female' : 'Other'}.
Vitals: Weight ${activePatient.vitals?.weight || 'N/A'}kg, BP ${activePatient.vitals?.bp || 'N/A'}, Temp ${activePatient.vitals?.temp || 'N/A'}°F, SpO2 ${activePatient.vitals?.spo2 || 'N/A'}%.
Past Medical History: ${pastHistoryStr || 'None'}. ${activePatient.pastHistory?.notes ? `Notes: ${activePatient.pastHistory.notes}` : ''}
Current Symptoms: "${activePatient.symptoms}"

Task: Provide a "Zen MD" style expert clinical assessment. 
1. Suggest the most likely precise diagnosis based on the symptoms and vitals.
2. Recommend highly relevant, targeted lab tests (if any) to confirm the diagnosis or rule out critical differentials. Keep it minimal and cost-effective.
3. Provide a standard, evidence-based prescription using typical Indian clinical guidelines. Include exact medicine names, standard dosages (strictly adjusted for the patient's age and weight), frequency, and duration.
4. ANTIBIOTIC STEWARDSHIP: If an antibiotic is strictly clinically indicated based on the symptoms (e.g., suspected bacterial infection), suggest a standard, system-specific antibiotic (e.g., respiratory, GI, UTI) following Indian clinical guidelines. Do NOT prescribe antibiotics for clear viral symptoms.
${isUnder20kg ? '5. CRITICAL PEDIATRIC RULE: Patient is under 20kg. You MUST ONLY prescribe Syrups (Syp) or Drops. DO NOT prescribe Tablets or Capsules.\n' : ''}
6. Provide holistic patient advice (notes). Include:
   - Brief differential diagnosis (DDx).
   - Diet & Lifestyle modifications (Zen approach).
   - Red Flags (when to visit the ER/return immediately).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnosis: { type: Type.STRING },
              labTests: { type: Type.STRING, description: "Comma separated list of recommended lab tests, or empty if none" },
              notes: { type: Type.STRING, description: "Holistic patient advice including DDx, Diet/Lifestyle, and Red Flags" },
              medicines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    dose: { type: Type.STRING },
                    freq: { type: Type.STRING },
                    duration: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });
      
      if (response.text) {
        const data = JSON.parse(response.text);
        
        const processedMedicines = data.medicines.map((m: any) => {
          const searchName = (m.name || '').toLowerCase();
          const match = MEDICINE_DB.find(dbMed => {
            const dbName = dbMed.name.toLowerCase();
            const dbForm = dbMed.form.toLowerCase();
            
            if (isUnder20kg && (dbForm.includes('tablet') || dbForm.includes('capsule') || dbForm.includes('tab') || dbForm.includes('cap'))) {
              return false;
            }
            
            return searchName.includes(dbName) || dbName.includes(searchName);
          });

          if (match) {
            const isPediatric = getPatientType(activePatient.age) === 'Pediatric';
            const stdDose = isPediatric && match.pediatricDose && match.pediatricDose !== 'Not recommended' 
              ? match.pediatricDose 
              : match.adultDose;

            return {
              id: Math.random().toString(),
              name: `${match.name} ${match.strength} ${match.form}`,
              dose: stdDose || m.dose,
              freq: m.freq,
              duration: m.duration
            };
          }
          return { id: Math.random().toString(), ...m };
        });

        updateActivePatient({
          diagnosis: data.diagnosis || activePatient.diagnosis,
          labTests: data.labTests || activePatient.labTests,
          notes: data.notes || activePatient.notes,
          prescription: processedMedicines
        });
      }
    } catch (error) {
      console.error("Failed to suggest Rx:", error);
      alert("Failed to generate prescription. Please try again.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddAppointment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newApt: Appointment = {
      id: Date.now().toString(),
      patientName: formData.get('patientName') as string,
      mobile: formData.get('mobile') as string,
      date: formData.get('date') as string,
      time: formData.get('time') as string,
      reason: formData.get('reason') as string,
      status: 'scheduled'
    };
    setAppointments(prev => [...prev, newApt]);
    e.currentTarget.reset();
  };

  const updateAppointmentStatus = (id: string, status: 'completed' | 'cancelled') => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.mobile.includes(searchQuery));

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans text-gray-900 print:block print:h-auto print:overflow-visible">
      
      {/* THIN SIDEBAR NAVIGATION */}
      <div className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-6 z-30 print:hidden shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg mb-4">
          <Activity size={24} />
        </div>
        
        <button onClick={() => setActiveTab('opd')} className={`p-3 rounded-xl transition-all ${activeTab === 'opd' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} title="OPD">
          <User size={20} />
        </button>
        <button onClick={() => setActiveTab('calendar')} className={`p-3 rounded-xl transition-all ${activeTab === 'calendar' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} title="Appointments">
          <Calendar size={20} />
        </button>
        <button onClick={() => setActiveTab('history')} className={`p-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} title="Patient History">
          <History size={20} />
        </button>
        <button onClick={() => setActiveTab('analytics')} className={`p-3 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} title="Analytics & Revenue">
          <BarChart3 size={20} />
        </button>
      </div>

      {activeTab === 'opd' && (
        <>
          {/* LEFT COLUMN: QUEUE (25%) */}
          <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col h-full shadow-[2px_0_8px_-4px_rgba(0,0,0,0.1)] z-20 print:hidden">
        <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-lg tracking-tight">Patient Queue</h2>
            <button onClick={handleAddPatient} className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-lg flex items-center justify-center transition-colors shadow-sm" title="Add Patient (Ctrl+N)">
              <Plus size={20} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by name or mobile..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm" 
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {filteredPatients.map(patient => (
            <div 
              key={patient.id}
              onClick={() => handlePatientClick(patient.id)}
              className={`relative p-3 rounded-xl cursor-pointer transition-all border ${
                activeId === patient.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-gray-100 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${
                patient.status === 'waiting' ? 'bg-amber-400' :
                patient.status === 'active' ? 'bg-blue-500' : 'bg-emerald-500'
              }`} />
              <div className="pl-3">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-1.5 truncate pr-2">
                    <span className="font-semibold text-sm truncate">{patient.name}</span>
                    {patient.visitCount > 0 && (
                      <span 
                        className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0" 
                        title={`${patient.visitCount} previous visit${patient.visitCount > 1 ? 's' : ''}`}
                      >
                        <History size={10} />
                        {patient.visitCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatAge(patient.age, patient.ageMonths)}{patient.gender}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-1">{patient.symptoms || 'No symptoms recorded'}</p>
              </div>
            </div>
          ))}
          {filteredPatients.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">No patients found</div>
          )}
        </div>
      </div>

      {/* CENTER COLUMN: CONSULTATION (50%) */}
      <div className="w-2/4 bg-gray-50/50 flex flex-col h-full relative print:hidden">
        {!activePatient ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <User size={48} className="mb-4 opacity-20" />
            <p>Select a patient from the queue to start</p>
          </div>
        ) : (
          <>
            {/* Top Action Bar */}
            <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-2">
                <button 
                  onClick={suggestRx}
                  disabled={isSuggesting || !activePatient.symptoms}
                  className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md text-sm font-medium transition-colors border border-indigo-100"
                >
                  {isSuggesting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} 
                  Suggest Rx
                </button>
                <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                  <FileText size={16} /> Templates
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveAndNext}
                  className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm"
                  title="Save & Next (Ctrl+S)"
                >
                  <Save size={16} /> Save & Next
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  title="Print (Ctrl+P)"
                >
                  <Printer size={16} /> Print
                </button>
              </div>
            </div>

            {/* Patient Info Bar & Edit Form */}
            {isEditingProfile ? (
              <div className="bg-white px-6 py-4 border-b border-gray-100 shadow-sm z-0">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-800">Edit Patient Details</h3>
                  <button onClick={() => setIsEditingProfile(false)} className="text-blue-600 text-sm font-medium hover:underline">Done</button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input type="text" value={activePatient.name} onChange={(e) => updateActivePatient({ name: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">DOB</label>
                    <input type="date" value={activePatient.dob} onChange={(e) => {
                      const dob = e.target.value;
                      const { years, months } = calculateAge(dob);
                      updateActivePatient({ dob, age: years, ageMonths: months });
                    }} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Age</label>
                    <div className="flex gap-1">
                      <input type="number" placeholder="Yrs" value={activePatient.age} onChange={(e) => updateActivePatient({ age: parseInt(e.target.value) || 0 })} className="w-1/2 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                      <input type="number" placeholder="Mos" value={activePatient.ageMonths || ''} onChange={(e) => updateActivePatient({ ageMonths: parseInt(e.target.value) || 0 })} className="w-1/2 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Gender</label>
                    <select value={activePatient.gender} onChange={(e) => updateActivePatient({ gender: e.target.value as 'M'|'F'|'O' })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500">
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Mobile</label>
                    <input type="tel" value={activePatient.mobile} onChange={(e) => updateActivePatient({ mobile: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Address</label>
                    <input type="text" value={activePatient.address} onChange={(e) => updateActivePatient({ address: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center justify-between text-sm shadow-sm z-0 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsEditingProfile(true)}>
                <div className="flex items-center gap-6">
                  <div className="font-bold text-lg tracking-tight">{activePatient.name}</div>
                  <div className="text-gray-500 flex items-center gap-1"><User size={14}/> {activePatient.age} Y / {activePatient.gender}</div>
                  <div className="text-gray-500">{activePatient.mobile}</div>
                  <div className="text-gray-500 truncate max-w-[150px]">{activePatient.address || 'No Address'}</div>
                  <div className={`px-2 py-0.5 rounded text-xs font-semibold border ${getPatientType(activePatient.age) === 'Pediatric' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                    {getPatientType(activePatient.age)}
                  </div>
                  <div className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-semibold border border-blue-100">Visit #{activePatient.visitCount}</div>
                </div>
                <div className="text-xs text-blue-600 font-medium">Edit</div>
              </div>
            )}

            {/* Vitals & History Summary */}
            <div className="bg-white border-b border-gray-100 p-4 shadow-sm">
              <div className="grid grid-cols-6 gap-3 mb-4">
                {[
                  { key: 'weight', label: 'Weight (kg)', placeholder: 'e.g. 65' },
                  { key: 'height', label: 'Height (cm)', placeholder: 'e.g. 170' },
                  { key: 'temp', label: 'Temp (°F)', placeholder: 'e.g. 98.6' },
                  { key: 'pulse', label: 'Pulse (bpm)', placeholder: 'e.g. 72' },
                  { key: 'bp', label: 'BP (mmHg)', placeholder: 'e.g. 120/80' },
                  { key: 'spo2', label: 'SpO2 (%)', placeholder: 'e.g. 98' }
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {label} {key === 'weight' && getPatientType(activePatient.age) === 'Pediatric' && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="text" 
                      placeholder={placeholder}
                      value={activePatient.vitals?.[key as keyof Vitals] || ''}
                      onChange={(e) => updateActivePatient({ vitals: { ...(activePatient.vitals || defaultVitals), [key]: e.target.value } })}
                      className={`w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors ${
                        isAbnormal(key as keyof Vitals, activePatient.vitals?.[key as keyof Vitals] || '') 
                          ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-500' 
                          : 'border-gray-200 focus:border-blue-500'
                      }`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Past History</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['diabetes', 'hypertension', 'asthma', 'thyroid', 'allergies', 'pastSurgeries'].map((histKey) => {
                    const label = histKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    const isActive = activePatient.pastHistory?.[histKey as keyof PastHistory] as boolean || false;
                    return (
                      <button 
                        key={histKey}
                        onClick={() => updateActivePatient({ pastHistory: { ...(activePatient.pastHistory || defaultHistory), [histKey]: !isActive } })}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isActive ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input 
                  type="text" 
                  placeholder="Additional history notes..." 
                  value={activePatient.pastHistory?.notes || ''}
                  onChange={(e) => updateActivePatient({ pastHistory: { ...(activePatient.pastHistory || defaultHistory), notes: e.target.value } })}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Consultation Inputs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Symptoms</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {COMMON_SYMPTOMS.map(sym => (
                    <button
                      key={sym}
                      onClick={() => {
                        const current = activePatient.symptoms;
                        const updated = current ? `${current}, ${sym}` : sym;
                        updateActivePatient({ symptoms: updated });
                      }}
                      className="flex items-center gap-1 bg-white border border-gray-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 text-gray-600 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shadow-sm"
                    >
                      <Plus size={12} /> {sym}
                    </button>
                  ))}
                </div>
                <textarea 
                  ref={symptomsRef}
                  value={activePatient.symptoms}
                  onChange={(e) => updateActivePatient({ symptoms: e.target.value })}
                  onKeyDown={handleEnterKey}
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none h-24 text-sm shadow-sm" 
                  placeholder="Enter symptoms or click + above..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Diagnosis</label>
                <input 
                  type="text" 
                  value={activePatient.diagnosis}
                  onChange={(e) => updateActivePatient({ diagnosis: e.target.value })}
                  onKeyDown={handleEnterKey}
                  list="common-diagnoses"
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-medium shadow-sm" 
                  placeholder="Enter diagnosis..." 
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Lab Tests (Optional)</label>
                <input 
                  type="text" 
                  value={activePatient.labTests}
                  onChange={(e) => updateActivePatient({ labTests: e.target.value })}
                  onKeyDown={handleEnterKey}
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm shadow-sm" 
                  placeholder="e.g. CBC, LFT, Lipid Profile..." 
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notes & Advice (Optional)</label>
                <textarea 
                  value={activePatient.notes}
                  onChange={(e) => updateActivePatient({ notes: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (activePatient.prescription.length === 0) {
                        addMedicineRow();
                      }
                      setTimeout(() => {
                        document.getElementById('med-name-0')?.focus();
                      }, 50);
                    }
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm shadow-sm resize-y min-h-[100px]" 
                  placeholder="Additional notes, differential diagnosis, diet/lifestyle advice, red flags..." 
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT COLUMN: PRESCRIPTION (25%) */}
      <div className="w-1/4 bg-white border-l border-gray-200 flex flex-col h-full shadow-[-2px_0_8px_-4px_rgba(0,0,0,0.05)] z-20 print:hidden">
        <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10 flex justify-between items-center">
          <h2 className="font-bold text-lg tracking-tight">Prescription Rx</h2>
          {activePatient && (
            <button onClick={addMedicineRow} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors text-sm font-medium">
              + Add
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {!activePatient ? (
             <div className="text-center text-gray-400 text-sm py-8">No active patient</div>
          ) : activePatient.prescription.length === 0 ? (
            <div 
              onClick={addMedicineRow}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-sm"
            >
              Click to add medicine or press Enter from Notes
            </div>
          ) : (
            activePatient.prescription.map((med, index) => (
              <div key={med.id} className="group relative border border-gray-200 rounded-xl p-3 hover:border-blue-300 transition-colors bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                <button 
                  onClick={() => removeMedicine(med.id)}
                  className="absolute -right-2 -top-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >
                  ×
                </button>
                <MedicineAutocomplete
                  id={`med-name-${index}`}
                  value={med.name}
                  patientType={getPatientType(activePatient.age)}
                  patientWeight={activePatient.vitals?.weight}
                  patientAge={activePatient.age}
                  onChange={(val) => updateMedicine(med.id, 'name', val)}
                  onSelect={(selectedMed) => {
                    if (!med.dose) {
                      const dose = getPatientType(activePatient.age) === 'Pediatric' && selectedMed.pediatricDose && selectedMed.pediatricDose !== 'Not recommended' 
                        ? selectedMed.pediatricDose 
                        : selectedMed.adultDose;
                      if (dose && dose !== '-') {
                        updateMedicine(med.id, 'dose', dose);
                      }
                    }
                  }}
                  onEnter={handleEnterKey}
                />
                
                {(() => {
                  const match = MEDICINE_DB.find(dbMed => med.name.toLowerCase().includes(dbMed.name.toLowerCase()));
                  if (match) {
                    return (
                      <div className="text-[10px] text-indigo-600 mt-0.5 mb-1.5 font-medium flex items-center gap-2 bg-indigo-50/50 px-1.5 py-0.5 rounded w-fit border border-indigo-100">
                        <span><strong className="font-semibold">Adult:</strong> {match.adultDose}</span>
                        {match.pediatricDose && match.pediatricDose !== 'Not recommended' && (
                          <>
                            <span className="text-indigo-300">|</span>
                            <span><strong className="font-semibold">Ped:</strong> {match.pediatricDose}</span>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={med.dose}
                    onChange={(e) => updateMedicine(med.id, 'dose', e.target.value)}
                    onKeyDown={handleEnterKey}
                    placeholder="Dose" 
                    className="w-1/3 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition-colors" 
                  />
                  <input 
                    type="text" 
                    value={med.freq}
                    onChange={(e) => updateMedicine(med.id, 'freq', e.target.value)}
                    onKeyDown={handleEnterKey}
                    placeholder="Freq" 
                    list="freq-presets"
                    className="w-1/3 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition-colors" 
                  />
                  <input 
                    type="text" 
                    value={med.duration}
                    onChange={(e) => updateMedicine(med.id, 'duration', e.target.value)}
                    onKeyDown={(e) => handleMedicineDaysEnter(e, index)}
                    placeholder="Days" 
                    className="w-1/3 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition-colors" 
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </>
      )}

      {activeTab === 'calendar' && (
        <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
          <h1 className="text-2xl font-bold mb-6">Appointments & Calendar</h1>
          <div className="flex gap-8">
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">Upcoming Appointments</h2>
              <div className="space-y-4">
                {appointments.filter(a => a.status === 'scheduled').sort((a,b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()).map(apt => (
                  <div key={apt.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-900">{apt.patientName}</div>
                      <div className="text-sm text-gray-500">{apt.mobile} • {apt.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600">{new Date(apt.date).toLocaleDateString()}</div>
                      <div className="text-sm text-gray-500">{apt.time}</div>
                    </div>
                    <div className="ml-4 flex gap-2">
                      <button onClick={() => updateAppointmentStatus(apt.id, 'completed')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Mark Completed"><CheckCircle2 size={18} /></button>
                      <button onClick={() => updateAppointmentStatus(apt.id, 'cancelled')} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Cancel"><XCircle size={18} /></button>
                    </div>
                  </div>
                ))}
                {appointments.filter(a => a.status === 'scheduled').length === 0 && (
                  <div className="text-center text-gray-500 py-8">No upcoming appointments</div>
                )}
              </div>
            </div>
            
            <div className="w-96 bg-white rounded-xl border border-gray-200 shadow-sm p-6 h-fit">
              <h2 className="text-lg font-bold mb-4">New Appointment</h2>
              <form onSubmit={handleAddAppointment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
                  <input required type="text" name="patientName" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                  <input required type="tel" name="mobile" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input required type="date" name="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                    <input required type="time" name="time" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Visit</label>
                  <input type="text" name="reason" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-bold rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors">
                  Schedule Appointment
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex-1 p-8 bg-white overflow-y-auto">
          <h1 className="text-2xl font-bold mb-6">Patient History</h1>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-semibold text-sm text-gray-600">Date</th>
                  <th className="p-4 font-semibold text-sm text-gray-600">Patient</th>
                  <th className="p-4 font-semibold text-sm text-gray-600">Diagnosis</th>
                  <th className="p-4 font-semibold text-sm text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {patients.filter(p => p.status === 'completed').map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-500">{new Date().toLocaleDateString()}</td>
                    <td className="p-4 font-medium">{p.name} <span className="text-xs text-gray-400 font-normal ml-2">{p.mobile}</span></td>
                    <td className="p-4 text-sm">{p.diagnosis || '-'}</td>
                    <td className="p-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium">Completed</span></td>
                  </tr>
                ))}
                {patients.filter(p => p.status === 'completed').length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-400 text-sm">No completed patients yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
          <h1 className="text-2xl font-bold mb-6">Analytics & Revenue</h1>
          
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Today&apos;s Patients</div>
              <div className="text-4xl font-bold text-gray-900">{patients.length}</div>
              <div className="text-sm text-emerald-600 font-medium mt-2">↑ 12% from yesterday</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Completed</div>
              <div className="text-4xl font-bold text-blue-600">{patients.filter(p => p.status === 'completed').length}</div>
              <div className="text-sm text-gray-500 font-medium mt-2">Out of {patients.length} total</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Est. Revenue</div>
              <div className="text-4xl font-bold text-emerald-600">₹{patients.filter(p => p.status === 'completed').length * 500}</div>
              <div className="text-sm text-gray-500 font-medium mt-2">Based on ₹500/consultation</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
             <h3 className="font-bold text-lg mb-4">Common Diagnoses Today</h3>
             <div className="space-y-4">
               {Object.entries(
                 patients.reduce((acc, p) => {
                   if (p.diagnosis) acc[p.diagnosis] = (acc[p.diagnosis] || 0) + 1;
                   return acc;
                 }, {} as Record<string, number>)
               ).map(([diag, count]) => (
                 <div key={diag} className="flex items-center justify-between">
                   <span className="text-sm font-medium">{diag}</span>
                   <div className="flex-1 mx-4 h-2 bg-gray-100 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500" style={{ width: `${(count / patients.length) * 100}%` }} />
                   </div>
                   <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                 </div>
               ))}
               {patients.filter(p => p.diagnosis).length === 0 && (
                 <div className="text-sm text-gray-400 text-center py-4">No diagnoses recorded yet.</div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* Datalists for autocomplete */}
      <datalist id="common-diagnoses">
        {COMMON_DIAGNOSES.map(diag => <option key={diag} value={diag} />)}
      </datalist>
      <datalist id="common-meds">
        {COMMON_MEDS.map(med => <option key={med} value={med} />)}
      </datalist>
      <datalist id="freq-presets">
        {FREQ_PRESETS.map(freq => <option key={freq} value={freq} />)}
      </datalist>

      {/* PRINT LAYOUT (Hidden on screen, visible on print) */}
      <div id="print-area" className="hidden print:block">
        {activePatient && (
          <div className="font-sans text-black">
            <div className="text-center border-b-2 border-black pb-4 mb-6">
              <h1 className="text-3xl font-bold uppercase tracking-wider">Navjeevan Clinic</h1>
              <p className="text-lg mt-1">Dr. Karan Bhavare (BAMS)</p>
              <p className="text-sm text-gray-600">Reg No: 12345 | Ph: 9876543210</p>
            </div>
            
            <div className="flex justify-between border-b border-gray-300 pb-4 mb-4 text-sm">
              <div>
                <p><strong>Patient Name:</strong> {activePatient.name}</p>
                <p><strong>Age/Gender:</strong> {activePatient.age} / {activePatient.gender} ({getPatientType(activePatient.age)})</p>
                {activePatient.address && <p><strong>Address:</strong> {activePatient.address}</p>}
              </div>
              <div className="text-right">
                <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                <p><strong>Mobile:</strong> {activePatient.mobile || 'N/A'}</p>
              </div>
            </div>

            {/* Vitals Print */}
            <div className="flex flex-wrap gap-4 mb-4 text-sm border-b border-gray-200 pb-4">
              {activePatient.vitals?.weight && <div><strong>Wt:</strong> {activePatient.vitals.weight} kg</div>}
              {activePatient.vitals?.height && <div><strong>Ht:</strong> {activePatient.vitals.height} cm</div>}
              {activePatient.vitals?.temp && <div><strong>Temp:</strong> {activePatient.vitals.temp} °F</div>}
              {activePatient.vitals?.pulse && <div><strong>PR:</strong> {activePatient.vitals.pulse} bpm</div>}
              {activePatient.vitals?.bp && <div><strong>BP:</strong> {activePatient.vitals.bp} mmHg</div>}
              {activePatient.vitals?.spo2 && <div><strong>SpO2:</strong> {activePatient.vitals.spo2} %</div>}
            </div>

            {/* Past History Print */}
            {(activePatient.pastHistory && (Object.entries(activePatient.pastHistory).some(([k, v]) => k !== 'notes' && v) || activePatient.pastHistory.notes)) && (
              <div className="mb-4 text-sm border-b border-gray-200 pb-4">
                <h3 className="font-bold text-xs uppercase text-gray-500 mb-1">Past History</h3>
                <p>
                  {['diabetes', 'hypertension', 'asthma', 'thyroid', 'allergies', 'pastSurgeries']
                    .filter(k => activePatient.pastHistory?.[k as keyof PastHistory])
                    .map(k => k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()))
                    .join(', ')}
                  {activePatient.pastHistory?.notes && ` - ${activePatient.pastHistory.notes}`}
                </p>
              </div>
            )}

            <div className="mb-8">
              {activePatient.symptoms && (
                <div className="mb-4">
                  <h3 className="font-bold text-sm uppercase text-gray-500 mb-1">Symptoms</h3>
                  <p>{activePatient.symptoms}</p>
                </div>
              )}
              {activePatient.diagnosis && (
                <div className="mb-4">
                  <h3 className="font-bold text-sm uppercase text-gray-500 mb-1">Diagnosis</h3>
                  <p className="font-medium">{activePatient.diagnosis}</p>
                </div>
              )}
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-serif font-bold mb-4">Rx</h2>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="py-2">Medicine</th>
                    <th className="py-2">Dose</th>
                    <th className="py-2">Frequency</th>
                    <th className="py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {activePatient.prescription.map((med, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3 font-bold">{med.name}</td>
                      <td className="py-3">{med.dose}</td>
                      <td className="py-3">{med.freq}</td>
                      <td className="py-3">{med.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activePatient.labTests && (
              <div className="mb-8">
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-1">Recommended Lab Tests</h3>
                <p>{activePatient.labTests}</p>
              </div>
            )}

            {activePatient.notes && (
              <div className="mb-8">
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-1">Advice / Notes</h3>
                <p>{activePatient.notes}</p>
              </div>
            )}

            <div className="mt-24 text-right">
              <p className="border-t border-black inline-block pt-2 px-8">Signature</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
