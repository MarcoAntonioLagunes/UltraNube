// src/services/api.js
import axios from 'axios';
import { API_URL } from '../config/api';

let authToken = null;

const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function getErrorMessage(error) {
  if (error?.response?.data) {
    const data = error.response.data;
    return data.message || data.error || JSON.stringify(data);
  }

  if (error?.message) {
    return error.message;
  }

  return 'Request failed';
}

const api = {
  setToken: (token) => {
    authToken = token;
  },

  async login(email, password) {
    try {
      const res = await apiClient.post('/api/auth/login', { email, password });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async register(name, email, password) {
    try {
      const res = await apiClient.post('/api/auth/register', { name, email, password });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async me() {
    try {
      const res = await apiClient.get('/api/auth/me');
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async listDrive(parentId = null) {
    try {
      const url = parentId ? `/api/drive/items?folderId=${parentId}` : '/api/drive/items';
      const res = await apiClient.get(url);
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async createFolder(name, parentId = null) {
    try {
      const res = await apiClient.post('/api/drive/folders', { name, parentId });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async renameFolder(folderId, name) {
    try {
      const res = await apiClient.patch(`/api/drive/folders/${folderId}`, { name });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async renameFile(fileId, name) {
    try {
      const res = await apiClient.patch(`/api/files/${fileId}`, { name });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async uploadFileAsync(file, folderId = null) {
    try {
      const form = new FormData();
      form.append('file', file);

      if (folderId) {
        form.append('folderId', folderId);
      }

      const res = await apiClient.post('/api/files/upload', form);
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async deleteFile(fileId) {
    try {
      const res = await apiClient.delete(`/api/files/${fileId}`);
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async deleteFolder(folderId) {
    try {
      const res = await apiClient.delete(`/api/drive/folders/${folderId}`);
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async searchItems(query) {
    try {
      const res = await apiClient.get(`/api/drive/search?q=${encodeURIComponent(query)}`);
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getFileBlob(fileId) {
    try {
      const res = await apiClient.get(`/api/files/${fileId}/download`, {
        responseType: 'blob',
      });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async downloadFile(fileId, fileName) {
    try {
      const res = await apiClient.get(`/api/files/${fileId}/download`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async chat(message, attachments = []) {
    try {
      const res = await apiClient.post('/api/ai/chat', {
        message,
        attachments,
      });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  // ── Profile & account ───────────────────────────────────────────────────
  async updateProfile(name) {
    try {
      const res = await apiClient.patch('/api/auth/me', { name });
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async uploadAvatar(file) {
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await apiClient.post('/api/auth/avatar', form);
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async changePassword(currentPassword, newPassword) {
    try {
      const res = await apiClient.post('/api/auth/change-password', { currentPassword, newPassword });
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async forgotPassword(email) {
    try {
      const res = await apiClient.post('/api/auth/forgot-password', { email });
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async resetPassword(token, newPassword) {
    try {
      const res = await apiClient.post('/api/auth/reset-password', { token, newPassword });
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async getStorageStats() {
    try {
      const res = await apiClient.get('/api/dashboard/storage');
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async moveFile(fileId, folderId) {
    try {
      const res = await apiClient.patch(`/api/files/${fileId}/move`, { folderId: folderId || null });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getAllUserFiles() {
    try {
      const res = await apiClient.get('/api/files/all');
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getRecentFiles() {
    try {
      const res = await apiClient.get('/api/files/recent/list');
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async anthropicProxy(system, messages, maxTokens = 4096) {
    try {
      const res = await apiClient.post('/api/ai/proxy', { system, messages, maxTokens });
      return res.data.text;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async logActivity(action, label, metadata = {}) {
    try {
      await apiClient.post('/api/activities/log', { action, label, metadata });
    } catch {
      // non-critical
    }
  },

  async getRecentActivity() {
    try {
      const res = await apiClient.get('/api/activities/recent');
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async clearActivity() {
    try {
      await apiClient.delete('/api/activities');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async deleteActivity(id) {
    try {
      await apiClient.delete(`/api/activities/${id}`);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getTypeBreakdown() {
    try {
      const res = await apiClient.get('/api/dashboard/type-breakdown');
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getDashboardStats() {
    try {
      const res = await apiClient.get('/api/dashboard/stats');
      return res.data;
    } catch (error) { throw new Error(getErrorMessage(error)); }
  },

  async extractPdfText(blob) {
    try {
      const form = new FormData();
      form.append('pdf', blob, 'file.pdf');
      const res = await apiClient.post('/api/files/extract-pdf-text', form, {
        timeout: 130_000, // backend has 120 s hard limit; give 10 s margin
      });
      return res.data; // { text, pages }
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('El servidor tardó demasiado en responder. Intenta con un PDF más pequeño.');
      }
      throw new Error(getErrorMessage(error));
    }
  },

  async uploadFileWithProgress(file, folderId = null, onProgress) {
    try {
      const form = new FormData();
      form.append('file', file);
      if (folderId) form.append('folderId', folderId);
      const res = await apiClient.post('/api/files/upload', form, {
        onUploadProgress: (evt) => {
          if (onProgress && evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      });
      return res.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};

export default api;