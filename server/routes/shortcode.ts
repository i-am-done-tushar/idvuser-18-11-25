import { RequestHandler } from "express";
import { ShortCodeResolveResponse, TemplateVersionResponse } from "@shared/api";

// Hardcoded API base URL - you can move this to environment variables later
const API_BASE_URL = "http://10.10.2.133:8080";
const AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwianRpIjoiYjIzN2M2NzUtMmQ5Zi00MTk5LWFjMDQtN2ZiNDY4ODQ2MDA5IiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZWlkZW50aWZpZXIiOiIxIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6ImFkbWluQGlkdi5sb2NhbCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL2VtYWlsYWRkcmVzcyI6ImFkbWluQGlkdi5sb2NhbCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFkbWluIiwibmJmIjoxNzU4NTI1NzA2LCJleHAiOjE3NTg1MjkzMDYsImlzcyI6IkFyY29uLklEVi5BUEkiLCJhdWQiOiJBcmNvbi5JRFYuQ2xpZW50In0.kIaeMCBm19Cw0DtjpdxkTf4NkgwBfziIqTBeW1cPDJY";

export const handleResolveShortCode: RequestHandler = async (req, res) => {
  const { shortCode } = req.params;
  
  if (!shortCode) {
    return res.status(400).json({ error: "Short code is required" });
  }

  try {
    // Make request to resolve shortcode
    const response = await fetch(`${API_BASE_URL}/api/templates-link-generation/resolve/${shortCode}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to resolve shortcode: ${response.status}`);
    }

    const data: ShortCodeResolveResponse = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error resolving shortcode:', error);
    res.status(500).json({ error: 'Failed to resolve shortcode' });
  }
};

export const handleGetTemplateVersion: RequestHandler = async (req, res) => {
  const { versionId } = req.params;
  
  if (!versionId) {
    return res.status(400).json({ error: "Version ID is required" });
  }

  try {
    // Make request to get template version
    const response = await fetch(`${API_BASE_URL}/api/TemplateVersion/${versionId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get template version: ${response.status}`);
    }

    const data: TemplateVersionResponse = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting template version:', error);
    res.status(500).json({ error: 'Failed to get template version' });
  }
};