import { useState, useEffect } from 'react';

/**
 * Custom hook for persisting tab state across page refreshes using localStorage
 * @param key - Unique identifier for the tab (e.g., "salesTab", "inventoryTab")
 * @param defaultTab - Default tab value if no saved tab exists (default: 0)
 * @returns [activeTab, setActiveTab] - Current active tab and setter function
 */
export function usePersistentTab(key: string, defaultTab: number = 0): [number, (tab: number) => void] {
  // Initialize state with value from localStorage or default
  const [activeTab, setActiveTabState] = useState<number>(() => {
    try {
      const savedTab = localStorage.getItem(key);
      return savedTab !== null ? parseInt(savedTab, 10) : defaultTab;
    } catch (error) {
      console.error(`Error loading tab state for key "${key}":`, error);
      return defaultTab;
    }
  });

  // Custom setter that also updates localStorage
  const setActiveTab = (tab: number) => {
    try {
      setActiveTabState(tab);
      localStorage.setItem(key, tab.toString());
    } catch (error) {
      console.error(`Error saving tab state for key "${key}":`, error);
    }
  };

  // Sync with localStorage when key changes
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(key);
      if (savedTab !== null) {
        setActiveTabState(parseInt(savedTab, 10));
      }
    } catch (error) {
      console.error(`Error syncing tab state for key "${key}":`, error);
    }
  }, [key]);

  return [activeTab, setActiveTab];
}
