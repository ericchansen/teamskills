// Hook to wake PostgreSQL server if it's stopped
import { useState, useEffect, useCallback } from 'react';

const WAKE_FUNCTION_URL = import.meta.env.VITE_WAKE_FUNCTION_URL || '';

export const useDatabaseWake = () => {
  const [dbStatus, setDbStatus] = useState('checking'); // checking, waking, ready, error
  const [wakeMessage, setWakeMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const checkAndWake = useCallback(async () => {
    if (!WAKE_FUNCTION_URL) {
      // No wake function configured, assume database is ready
      setDbStatus('ready');
      return;
    }

    try {
      setDbStatus('checking');
      const response = await fetch(`${WAKE_FUNCTION_URL}/api/wake-postgres`);
      const data = await response.json();

      if (data.status === 'ready') {
        setDbStatus('ready');
        setWakeMessage('');
      } else if (data.status === 'starting' || data.status === 'transitioning') {
        setDbStatus('waking');
        setWakeMessage(data.message || 'Database is starting...');
        
        // Poll again in 10 seconds
        if (retryCount < 30) { // Max 5 minutes of retries
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 10000);
        } else {
          setDbStatus('error');
          setWakeMessage('Database failed to start after 5 minutes. Please try again later.');
        }
      } else if (data.status === 'error') {
        setDbStatus('error');
        setWakeMessage(data.message || 'Failed to check database status');
      }
    } catch (error) {
      console.error('Wake function error:', error);
      // If wake function fails, try proceeding anyway (might work if DB is already up)
      setDbStatus('ready');
    }
  }, [retryCount]);

  useEffect(() => {
    checkAndWake();
  }, [checkAndWake]);

  return { dbStatus, wakeMessage, retryWake: checkAndWake };
};

export default useDatabaseWake;
