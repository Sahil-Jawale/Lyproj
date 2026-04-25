import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  // Current prescription result
  currentResult: null,
  setCurrentResult: (result) => set({ currentResult: result }),

  // Upload state
  isUploading: false,
  uploadProgress: 0,
  setUploading: (val) => set({ isUploading: val }),
  setUploadProgress: (val) => set({ uploadProgress: val }),

  // Interaction check results
  interactionResult: null,
  setInteractionResult: (result) => set({ interactionResult: result }),

  // Selected medicines for interaction check
  selectedMedicines: [],
  addMedicine: (med) => set((s) => ({
    selectedMedicines: s.selectedMedicines.includes(med) ? s.selectedMedicines : [...s.selectedMedicines, med]
  })),
  removeMedicine: (med) => set((s) => ({
    selectedMedicines: s.selectedMedicines.filter(m => m !== med)
  })),
  clearMedicines: () => set({ selectedMedicines: [], interactionResult: null }),

  // Notifications
  notifications: [],
  addNotification: (notif) => set((s) => ({
    notifications: [{ id: Date.now(), ...notif }, ...s.notifications].slice(0, 10)
  })),
  removeNotification: (id) => set((s) => ({
    notifications: s.notifications.filter(n => n.id !== id)
  })),
}))
