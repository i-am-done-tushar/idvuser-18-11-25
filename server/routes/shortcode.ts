import { RequestHandler } from "express";
import { ShortCodeResolveResponse, TemplateVersionResponse } from "@shared/api";

// Hardcoded API base URL - you can move this to environment variables later
const API_BASE_URL = "http://10.10.2.133:8080";
// const API_BASE_URL = "http://localhost:5027";


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
        'Accept': 'application/json'
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
        'Accept': 'application/json'
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