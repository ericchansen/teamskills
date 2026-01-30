// API utility for making requests to the backend
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, options);
  return response;
};

export default apiFetch;
