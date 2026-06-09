import axios from 'axios';

// 🎯 FIX: Dynamically adapt API base URL for Local, Render, Vercel, or Hugging Face Docker environments
const getBaseUrl = () => {
  // If an explicit environment variable is provided, honor it first
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // If running locally on localhost or a local network development IP interface
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000/api';
  }
  
  // If testing on a mobile device over your local Wi-Fi configuration layout network
  if (window.location.hostname === '10.59.110.138') {
    return 'http://10.59.110.138:8000/api';
  }

  // 🚀 PRODUCTION FALLBACK: Tells Nginx to safely catch and route requests internally inside Hugging Face Spaces
  return '/api';
};

const BASE = getBaseUrl();

// 🎯 FIX: Unified http client with a 3-minute timeout for slow AI operations
const http = axios.create({ 
  baseURL: BASE, 
  timeout: 180_000,
  headers: { 'Content-Type': 'application/json' }
});

// --- AI API Endpoints ---
export const scanRepo = async (body) => {
  const response = await http.post('/scan/', body);
  return response.data;
};

// 🎯 FIX (Issues 6 & 7): Switched from fetch to axios to inherit timeout and capture error details
export const generateFix = async (body) => {
  const response = await http.post('/fix/', {
    file_path: body.file_path,
    original_code: body.original_code,
    language: body.language,
    problems: body.problems
  });
  return response.data;
};

// 🎯 FIX (Issues 5, 6, 7): Unified axios call ensures commit failures are properly caught by the UI
export const commitFixToGitHub = async (payload) => {
  const response = await http.post('/fix/commit', payload);
  return response.data;
};

// --- Dashboard & Helper Utilities ---
export const getDashboardStats = async (owner) => {
  const response = await http.get(`/dashboard/stats/${owner}`);
  return response.data;
};

export const getScanHistory = async (owner, repo) => {
  const response = await http.get(`/scan/${owner}/${repo}/history`);
  return response.data;
};

// --- UI Formatting Helpers ---
export const scoreColor = (s) =>
  s >= 80 ? '#39ff14' : s >= 60 ? '#ffb800' : s >= 30 ? '#f97316' : '#ff3860';

export const scoreToRgb = (s) =>
  s >= 80 ? '57,255,20' : s >= 60 ? '255,184,0' : s >= 30 ? '249,115,22' : '255,56,96';

export const scoreToLabel = (s) =>
  s >= 80 ? 'HEALTHY' : s >= 60 ? 'MINOR' : s >= 30 ? 'MAJOR' : 'CRITICAL';

export const levelToColor = (lv) => ({
  healthy: '#39ff14', 
  minor: '#ffb800', 
  major: '#f97316', 
  critical: '#ff3860'
}[lv?.toLowerCase()] ?? '#94a3b8');

export const levelClass = (lv) => lv?.toLowerCase() ?? 'minor';