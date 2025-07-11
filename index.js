export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return this.handleAgentCard();
    }

    // Handler for UI schema
    if (pathname === "/ui/schema" && req.method === "GET") {
      return this.handleUISchema();
    }

    // Handler for auth JavaScript
    if (pathname === "/ui/auth.js" && req.method === "GET") {
      return this.handleAuthScript();
    }

    // Handler for API key validation - REQUIRES AUTHENTICATION
    if (pathname === "/validate-key" && req.method === "POST") {
      return this.handleValidateApiKey(req, env);
    }

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return this.handleCorsOptions();
    }

    // Request presigned upload URL - REQUIRES AUTHENTICATION
    if (pathname === "/upload/request" && req.method === "POST") {
      return this.handleUploadRequest(req, env);
    }

    // Complete presigned upload - REQUIRES AUTHENTICATION
    if (pathname === "/upload/complete" && req.method === "POST") {
      return this.handleUploadComplete(req, env);
    }

    // Legacy Upload PDF endpoint (for files <100MB) - REQUIRES AUTHENTICATION
    if (pathname === "/upload" && req.method === "POST") {
      return this.handleLegacyUpload(req, env);
    }

    // List all PDFs - REQUIRES AUTHENTICATION
    if (pathname === "/pdfs" && req.method === "GET") {
      return this.handleListPdfs(req, env);
    }

    // Get specific PDF - REQUIRES AUTHENTICATION
    if (pathname.startsWith("/pdf/") && req.method === "GET") {
      return this.handleGetPdf(req, env, pathname);
    }

    // Delete PDF - REQUIRES ADMIN AUTHENTICATION  
    if (pathname.startsWith("/pdf/") && req.method === "DELETE") {
      return this.handleDeletePdf(req, env, pathname);
    }

    // Default response
    return this.handleDefault();
  },



  // Handler for UI schema
  async handleUISchema() {
    try {
      console.log('Loading UI schema...');
      const schemaModule = await import('./ui/schema.js');
      console.log('Schema module loaded, agent name:', schemaModule.default?.agent_name);
      
      const jsonResponse = JSON.stringify(schemaModule.default, null, 2);
      console.log('Schema JSON length:', jsonResponse.length);
      
      return new Response(jsonResponse, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      console.error('Failed to load UI schema:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to load UI schema',
        details: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // Handler for auth script
  async handleAuthScript() {
    try {
      // Serve the auth handler JavaScript directly
      const authScript = `
// PDF Agent Authentication Handler
class PdfAgentAuth {
  constructor() {
    this.apiKey = null;
    this.authenticated = false;
    this.storageKey = 'loresmith_pdf_api_key';
    this.baseUrl = window.location.origin;  // Use current origin as base URL
    
    this.init();
  }
  
  init() {
    // Load saved API key if available
    const savedKey = localStorage.getItem(this.storageKey);
    if (savedKey) {
      this.apiKey = savedKey;
      this.validateApiKey().then(isValid => {
        if (isValid) {
          this.authenticated = true;
          this.updateUIState();
          this.loadInitialData();
        }
      });
    }
    
    this.bindEvents();
    this.updateUIState();
  }
  
  bindEvents() {
    // Handle authentication form submission
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'authentication-form') {
        e.preventDefault();
        this.handleAuthentication(e.target);
      }
    });
    
    // Handle other form submissions
    document.addEventListener('submit', (e) => {
      if (e.target.id !== 'authentication-form') {
        e.preventDefault();
        this.handleFormSubmit(e.target);
      }
    });
    
    // Handle button clicks
    document.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        e.preventDefault();
        this.handleButtonAction(e.target, action);
      }
    });
  }
  
  async handleAuthentication(form) {
    const apiKeyField = form.querySelector('input[name="pdfApiKey"]');
    const apiKey = apiKeyField?.value?.trim();
    
    if (!apiKey) {
      this.showMessage('error', 'Please enter an API key');
      return;
    }
    
    this.setLoading(form, true);
    
    try {
      // Test the API key using the validation endpoint
      const response = await fetch(this.baseUrl + '/validate-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey: apiKey })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.apiKey = apiKey;
          localStorage.setItem(this.storageKey, apiKey);
          this.authenticated = true;
          this.updateUIState();
          this.showMessage('success', 'Successfully connected! Your API key has been securely stored.');
          
          // Load initial data
          setTimeout(() => {
            this.loadInitialData();
          }, 500);
        } else {
          throw new Error(data.error || 'API key validation failed');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Invalid API key or authentication failed');
      }
    } catch (error) {
      this.showMessage('error', error.message);
    } finally {
      this.setLoading(form, false);
    }
  }
  
  async handleFormSubmit(form) {
    if (!this.authenticated) {
      this.showMessage('error', 'Please authenticate first');
      return;
    }
    
    const endpoint = form.dataset.endpoint;
    const method = form.dataset.method || 'POST';
    
    this.setLoading(form, true);
    
    try {
      const formData = new FormData(form);
      const headers = {
        'Authorization': 'Bearer ' + this.apiKey
      };
      
      let body;
      if (form.dataset.encoding === 'multipart/form-data') {
        body = formData;
      } else {
        body = JSON.stringify(Object.fromEntries(formData));
        headers['Content-Type'] = 'application/json';
      }
      
      const response = await fetch(this.baseUrl + endpoint, {
        method,
        headers,
        body
      });
      
      if (response.ok) {
        const data = await response.json();
        this.showMessage('success', 'Operation completed successfully');
        
        // Refresh data if needed
        if (form.dataset.successAction === 'refresh_library') {
          this.loadPdfLibrary();
        }
        
        // Clear form if configured
        if (form.querySelector('input[type="file"]')) {
          form.reset();
        }
      } else {
        throw new Error('Request failed: ' + response.status);
      }
    } catch (error) {
      this.showMessage('error', error.message);
    } finally {
      this.setLoading(form, false);
    }
  }
  
  async handleButtonAction(button, action) {
    switch (action) {
      case 'refresh_data':
        await this.loadPdfLibrary();
        break;
      case 'show_authentication':
        this.showAuthenticationForm();
        break;
      case 'download_file':
        await this.downloadFile(button.dataset.id);
        break;
      case 'delete_item':
        await this.deleteFile(button.dataset.id, button.dataset.name);
        break;
      case 'reset_form':
        this.resetForm(button);
        break;
      case 'show_modal':
        await this.showModal(button.dataset.id);
        break;
      case 'close_modal':
        this.closeModal();
        break;
    }
  }
  
  showAuthenticationForm() {
    this.authenticated = false;
    this.apiKey = null;
    localStorage.removeItem(this.storageKey);
    this.updateUIState();
    
    const authForm = document.querySelector('#authentication-form');
    if (authForm) {
      authForm.reset();
    }
    
    this.showMessage('info', 'Please enter your API key to reconnect.');
  }
  
  async validateApiKey() {
    if (!this.apiKey) return false;
    
    try {
      const response = await fetch(this.baseUrl + '/validate-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey: this.apiKey })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.success;
      }
      return false;
    } catch (error) {
      console.warn('API key validation failed:', error);
      return false;
    }
  }
  
  updateUIState() {
    const container = document.querySelector('.schema-ui-container');
    if (!container) return;
    
    // Only affect elements within the agent's container
    container.querySelectorAll('[data-show-when="authenticated"]').forEach(el => {
      el.style.display = this.authenticated ? 'block' : 'none';
    });
    
    container.querySelectorAll('[data-show-when="not_authenticated"]').forEach(el => {
      el.style.display = this.authenticated ? 'none' : 'block';
    });
  }
  
  async loadInitialData() {
    await this.loadPdfLibrary();
  }
  
  async loadPdfLibrary() {
    if (!this.authenticated) return;
    
    const libraryElement = document.querySelector('[data-component="pdf_library"]');
    if (!libraryElement) return;
    
    this.setLoading(libraryElement, true);
    
    try {
      const response = await fetch(this.baseUrl + '/pdfs', {
        headers: { 'Authorization': 'Bearer ' + this.apiKey }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.renderPdfLibrary(data);
      } else {
        throw new Error('Failed to load PDFs: ' + response.status);
      }
    } catch (error) {
      this.showMessage('error', 'Failed to load PDF library: ' + error.message);
    } finally {
      this.setLoading(libraryElement, false);
    }
  }
  
  renderPdfLibrary(data) {
    const libraryElement = document.querySelector('[data-component="pdf_library"]');
    const container = libraryElement?.querySelector('.data-list');
    if (!container) return;
    
    const pdfs = Array.isArray(data) ? data : data.pdfs || [];
    
    if (pdfs.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><p>No PDFs found. Upload your first PDF to get started!</p></div>';
      return;
    }
    
    container.innerHTML = pdfs.map(pdf => 
      '<div class="data-list-item">' +
        '<div class="data-list-item-content">' +
          '<div class="data-list-item-title">' + (pdf.name || pdf.filename) + '</div>' +
          '<div class="data-list-item-subtitle">Size: ' + this.formatFileSize(pdf.size) + '</div>' +
          '<div class="data-list-item-subtitle">Uploaded: ' + new Date(pdf.uploaded_at || pdf.uploadDate).toLocaleDateString() + '</div>' +
          '<div class="data-list-item-subtitle">Tags: ' + (pdf.tags || 'No tags') + '</div>' +
        '</div>' +
        '<div class="data-list-item-actions">' +
          '<button class="button button-primary button-small" data-action="download_file" data-id="' + pdf.id + '">Download</button>' +
          '<button class="button button-secondary button-small" data-action="show_modal" data-id="' + pdf.id + '">Info</button>' +
          '<button class="button button-danger button-small" data-action="delete_item" data-id="' + pdf.id + '" data-name="' + (pdf.name || pdf.filename) + '">Delete</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }
  
  async downloadFile(fileId) {
    if (!fileId || !this.authenticated) return;
    
    try {
      const response = await fetch(this.baseUrl + '/pdf/' + fileId, {
        headers: { 'Authorization': 'Bearer ' + this.apiKey }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'pdf-' + fileId + '.pdf';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        this.showMessage('success', 'File downloaded successfully');
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      this.showMessage('error', 'Failed to download file: ' + error.message);
    }
  }
  
  async deleteFile(fileId, fileName) {
    if (!fileId || !this.authenticated) return;
    
    if (!confirm('Are you sure you want to delete "' + fileName + '"? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(this.baseUrl + '/pdf/' + fileId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + this.apiKey }
      });
      
      if (response.ok) {
        this.showMessage('success', 'File deleted successfully');
        this.loadPdfLibrary();
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      this.showMessage('error', 'Failed to delete file: ' + error.message);
    }
  }
  
  resetForm(button) {
    const form = button.closest('form');
    if (form) {
      form.reset();
      this.showMessage('info', 'Form cleared');
    }
  }
  
  async showModal(fileId) {
    console.log('Show modal for file:', fileId);
  }
  
  closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.classList.remove('show'));
  }
  
  setLoading(element, loading) {
    if (loading) {
      element.classList.add('loading');
    } else {
      element.classList.remove('loading');
    }
  }
  
  showMessage(type, message) {
    const container = document.querySelector('.schema-ui-container') || document.body;
    const messageEl = document.createElement('div');
    messageEl.className = 'message ' + type;
    messageEl.textContent = message;
    messageEl.style.cssText = 
      'padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 14px;' +
      (type === 'success' ? 'background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0;' : '') +
      (type === 'error' ? 'background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;' : '') +
      (type === 'info' ? 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;' : '');
    
    container.insertBefore(messageEl, container.firstChild);
    
    if (type === 'success') {
      setTimeout(() => messageEl.remove(), 3000);
    }
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.pdfAgentAuth = new PdfAgentAuth();
});
`;
      
      return new Response(authScript, {
        headers: {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      console.error('Failed to serve auth script:', error);
      return new Response(`console.error('Failed to load PDF agent auth script: ${error.message}');`, {
        status: 500,
        headers: { 
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  },

  // Handler for /.well-known/agent.json
  async handleAgentCard() {
    return new Response(JSON.stringify({
      "@type": "AgentCard",
      "name": "LoreSmith PDF Storage Agent",
      "description": "Stores and manages D&D 5e PDFs for campaign planning. Handles large PDF uploads up to 200MB, extracts metadata, and provides retrieval endpoints.",
      "version": "1.0.0",
      "icon": "📚",
      "ui_schema": "/ui/schema",
      "example_prompts": [
        "I want to upload a PDF",
        "Help me store my D&D books",
        "I need to manage my campaign PDFs",
        "Upload my Player's Handbook",
        "Store my homebrew documents",
        "I need to manage my campaign resources"
      ],
      "capabilities": [
        "pdf-upload",
        "pdf-storage", 
        "pdf-retrieval",
        "metadata-extraction",
        "text-extraction",
        "large-file-support"
      ],
      "api": {
        "url": "https://loresmith.example.workers.dev",
        "authentication": {
          "type": "api-key",
          "header": "Authorization",
          "format": "Bearer {api-key}",
          "required_for": ["all_endpoints"]
        },
        "rate_limits": {
          "uploads_per_hour": 10,
          "uploads_per_day": 50
        },
        "file_limits": {
          "max_size": "200MB",
          "supported_types": ["application/pdf"]
        },
        "endpoints": [
          {
            "path": "/validate-key",
            "method": "POST",
            "description": "Validate an API key without performing any operations",
            "accepts": "application/json",
            "authentication": "none",
            "parameters": {
              "apiKey": "The API key to validate"
            }
          },
          {
            "path": "/upload/request",
            "method": "POST",
            "description": "Request a presigned upload URL for large PDFs",
            "accepts": "application/json",
            "authentication": "required",
            "parameters": {
              "filename": "Original filename",
              "size": "File size in bytes",
              "name": "Optional custom name for the PDF",
              "tags": "Optional comma-separated tags"
            }
          },
          {
            "path": "/upload/complete",
            "method": "POST",
            "description": "Complete the upload process after direct R2 upload",
            "accepts": "application/json",
            "authentication": "required",
            "parameters": {
              "upload_id": "Upload ID from request step",
              "etag": "ETag returned from R2 upload"
            }
          },
          {
            "path": "/upload",
            "method": "POST",
            "description": "Upload a PDF file (legacy method, <100MB only)",
            "accepts": "multipart/form-data",
            "authentication": "required",
            "parameters": {
              "file": "PDF file to upload",
              "name": "Optional custom name for the PDF",
              "tags": "Optional comma-separated tags"
            }
          },
          {
            "path": "/pdfs",
            "method": "GET", 
            "description": "List all stored PDFs",
            "authentication": "required"
          },
          {
            "path": "/pdf/{id}",
            "method": "GET",
            "description": "Download a specific PDF",
            "authentication": "required"
          },
          {
            "path": "/pdf/{id}/metadata",
            "method": "GET",
            "description": "Get PDF metadata and extracted text preview",
            "authentication": "required"
          },
          {
            "path": "/pdf/{id}",
            "method": "DELETE",
            "description": "Delete a PDF",
            "authentication": "required"
          }
        ]
      }
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Handler for API key validation
  async handleValidateApiKey(req, env) {
    try {
      const body = await req.json();
      const { apiKey } = body;

      if (!apiKey) {
        return new Response(JSON.stringify({
          error: "API key is required"
        }), { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Test the API key by trying to authenticate with it
      const authResult = await this.checkAuthentication(req, env, false, apiKey);
      
      if (authResult.success) {
        return new Response(JSON.stringify({
          success: true,
          message: "API key is valid",
          clientId: authResult.success.clientId
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } else {
        return new Response(JSON.stringify({
          error: "Invalid API key"
        }), { 
          status: 401,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to validate API key",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handler for CORS preflight requests
  async handleCorsOptions() {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  },

  // Handler for /upload/request
  async handleUploadRequest(req, env) {
    // Check authentication
    const authResponse = await this.requireAuthentication(req, env,);
    if (authResponse.error) return authResponse.error;
    const authResult = authResponse.success;

    // Check rate limits
    const rateLimitResult = await this.checkRateLimit(req, env, authResult.clientId);
    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({
        error: "Rate limit exceeded",
        message: rateLimitResult.message,
        limits: {
          uploads_per_hour: parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10"),
          uploads_per_day: parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50")
        },
        retry_after: rateLimitResult.retryAfter
      }), { 
        status: 429,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Retry-After": rateLimitResult.retryAfter?.toString() || "3600"
        }
      });
    }

    try {
      const body = await req.json();
      const { filename, size, name, tags } = body;

      if (!filename || !size) {
        return new Response(JSON.stringify({
          error: "Missing required fields: filename and size"
        }), { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Check file size (limit to 200MB)
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (size > maxSize) {
        return new Response(JSON.stringify({
          error: "File too large",
          message: `PDF must be smaller than ${maxSize / (1024 * 1024)}MB`,
          size: size
        }), { 
          status: 413,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Generate unique ID for the PDF
      const uploadId = crypto.randomUUID();
      const pdfKey = `pdfs/${uploadId}.pdf`;
      
      // Generate presigned URL for R2 upload
      const presignedUrl = await env.loresmith_pdfs.createPresignedUrl(pdfKey, {
        method: "PUT",
        expiresIn: 3600, // 1 hour
        httpMetadata: {
          contentType: "application/pdf"
        }
      });

      // Store pending upload metadata
      const pendingMetadata = {
        uploadId: uploadId,
        originalName: name || filename,
        filename: filename,
        size: size,
        tags: tags ? tags.split(",").map(t => t.trim()) : [],
        uploadedBy: authResult.clientId,
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
      };

      await env.PDF_METADATA.put(`pending:${uploadId}`, JSON.stringify(pendingMetadata), {
        expirationTtl: 3600 // 1 hour
      });

      // Update rate limit counters
      await this.updateRateLimit(env, authResult.clientId);

      return new Response(JSON.stringify({
        success: true,
        upload_id: uploadId,
        presigned_url: presignedUrl,
        expires_in: 3600,
        instructions: {
          method: "PUT",
          headers: {
            "Content-Type": "application/pdf"
          },
          note: "Upload the file directly to the presigned URL, then call /upload/complete"
        }
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to create upload request",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handler for /upload/complete
  async handleUploadComplete(req, env) {
    // Check authentication
    const authResponse = await this.requireAuthentication(req, env);
    if (authResponse.error) return authResponse.error;
    const authResult = authResponse.success;

    try {
      const body = await req.json();
      const { upload_id, etag } = body;

      if (!upload_id) {
        return new Response(JSON.stringify({
          error: "Missing required field: upload_id"
        }), { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Get pending upload metadata
      const pendingData = await env.PDF_METADATA.get(`pending:${upload_id}`);
      if (!pendingData) {
        return new Response(JSON.stringify({
          error: "Upload not found or expired"
        }), { 
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      const pendingMetadata = JSON.parse(pendingData);

      // Verify the upload belongs to the authenticated user
      if (pendingMetadata.uploadedBy !== authResult.clientId) {
        return new Response(JSON.stringify({
          error: "Unauthorized to complete this upload"
        }), { 
          status: 403,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Verify the file exists in R2
      const pdfKey = `pdfs/${upload_id}.pdf`;
      const pdfObject = await env.loresmith_pdfs.head(pdfKey);
      if (!pdfObject) {
        return new Response(JSON.stringify({
          error: "File not found in storage. Please retry the upload."
        }), { 
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Create final metadata
      const metadata = {
        id: upload_id,
        originalName: pendingMetadata.originalName,
        uploadDate: new Date().toISOString(),
        size: pdfObject.size,
        tags: pendingMetadata.tags,
        textPreview: "Large PDF - text extraction pending",
        contentType: "application/pdf",
        uploadedBy: authResult.clientId,
        etag: etag
      };

      // Store final metadata
      await env.PDF_METADATA.put(`pdf:${upload_id}`, JSON.stringify(metadata));

      // Clean up pending metadata
      await env.PDF_METADATA.delete(`pending:${upload_id}`);

      return new Response(JSON.stringify({
        success: true,
        pdf_id: upload_id,
        message: "PDF upload completed successfully",
        metadata: metadata
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to complete upload",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handler for legacy /upload endpoint
  async handleLegacyUpload(req, env) {
    // Check authentication
    const authResponse = await this.requireAuthentication(req, env);
    if (authResponse.error) return authResponse.error;
    const authResult = authResponse.success;

    // Check rate limits
    const rateLimitResult = await this.checkRateLimit(req, env, authResult.clientId);
    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({
        error: "Rate limit exceeded",
        message: rateLimitResult.message,
        limits: {
          uploads_per_hour: parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10"),
          uploads_per_day: parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50")
        },
        retry_after: rateLimitResult.retryAfter
      }), { 
        status: 429,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Retry-After": rateLimitResult.retryAfter?.toString() || "3600"
        }
      });
    }

    try {
      const formData = await req.formData();
      const file = formData.get("file");
      const customName = formData.get("name");
      const tags = formData.get("tags");

      if (!file || file.type !== "application/pdf") {
        return new Response(JSON.stringify({
          error: "Please upload a valid PDF file"
        }), { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Check file size (limit to 95MB for legacy uploads to stay under Worker limit)
      const maxSize = 95 * 1024 * 1024; // 95MB
      if (file.size > maxSize) {
        return new Response(JSON.stringify({
          error: "File too large for direct upload",
          message: `Files larger than ${maxSize / (1024 * 1024)}MB must use the presigned upload method. Use /upload/request instead.`,
          size: file.size,
          recommendation: "Use /upload/request endpoint for files up to 200MB"
        }), { 
          status: 413,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // Generate unique ID for the PDF
      const pdfId = crypto.randomUUID();
      const fileName = customName || file.name || `pdf_${pdfId}.pdf`;
      
      // Store PDF in R2
      const pdfKey = `pdfs/${pdfId}.pdf`;
      await env.loresmith_pdfs.put(pdfKey, file.stream(), {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${fileName}"`
        }
      });

      // Extract basic text content (first few KB for preview)
      const pdfBuffer = await file.arrayBuffer();
      const textPreview = await this.extractTextPreview(pdfBuffer);

      // Store metadata in KV
      const metadata = {
        id: pdfId,
        originalName: fileName,
        uploadDate: new Date().toISOString(),
        size: file.size,
        tags: tags ? tags.split(",").map(t => t.trim()) : [],
        textPreview: textPreview,
        contentType: "application/pdf",
        uploadedBy: authResult.clientId
      };

      await env.PDF_METADATA.put(`pdf:${pdfId}`, JSON.stringify(metadata));

      // Update rate limit counters
      await this.updateRateLimit(env, authResult.clientId);

      return new Response(JSON.stringify({
        success: true,
        pdfId: pdfId,
        message: "PDF uploaded successfully",
        metadata: metadata
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to upload PDF",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handler for /pdfs (list all PDFs)
  async handleListPdfs(req, env) {
    // Check authentication
    const authResponse = await this.requireAuthentication(req, env);
    if (authResponse.error) return authResponse.error;

    try {
      // Check if PDF_METADATA binding exists
      if (!env.PDF_METADATA) {
        console.log("PDF_METADATA KV binding not found - returning empty list");
        return new Response(JSON.stringify({
          pdfs: [],
          count: 0,
          message: "PDF storage is not configured yet. No PDFs available."
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      const listResult = await env.PDF_METADATA.list({ prefix: "pdf:" });
      const keys = listResult?.keys || [];
      const pdfs = [];

      console.log(`Found ${keys.length} PDF metadata entries`);

      for (const key of keys) {
        try {
          const metadata = await env.PDF_METADATA.get(key.name);
          if (metadata) {
            const pdfData = JSON.parse(metadata);
            // Remove sensitive info for listing
            delete pdfData.uploadedBy;
            pdfs.push(pdfData);
          }
        } catch (parseError) {
          console.log(`Failed to parse metadata for ${key.name}:`, parseError.message);
          // Continue with other PDFs instead of failing completely
        }
      }

      const message = pdfs.length === 0 ? "Your PDF library is currently empty. Upload some PDFs to get started!" : undefined;

      return new Response(JSON.stringify({
        pdfs: pdfs,
        count: pdfs.length,
        ...(message && { message })
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      console.log("PDF listing error:", error.message);
      
      // Return a graceful empty response instead of an error
      return new Response(JSON.stringify({
        pdfs: [],
        count: 0,
        message: "Unable to load PDF library at this time. This might be a configuration issue.",
        debug: error.message
      }), { 
        status: 200, // Changed from 500 to 200 to be more tolerant
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Handler for /pdf/{id} and /pdf/{id}/metadata
  async handleGetPdf(req, env, pathname) {
    // Check authentication
    const authResponse = await this.requireAuthentication(req, env);
    if (authResponse.error) return authResponse.error;

    const pathParts = pathname.split("/");
    const pdfId = pathParts[2];
    const action = pathParts[3]; // Could be 'metadata'

    if (action === "metadata") {
      // Return metadata only
      try {
        const metadata = await env.PDF_METADATA.get(`pdf:${pdfId}`);
        if (!metadata) {
          return new Response(JSON.stringify({
            error: "PDF not found"
          }), { 
            status: 404,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const pdfData = JSON.parse(metadata);
        // Remove sensitive info
        delete pdfData.uploadedBy;

        return new Response(JSON.stringify(pdfData), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to get PDF metadata",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    } else {
      // Return the PDF file
      try {
        const pdfKey = `pdfs/${pdfId}.pdf`;
        const pdfObject = await env.loresmith_pdfs.get(pdfKey);
        
        if (!pdfObject) {
          return new Response(JSON.stringify({
            error: "PDF not found"
          }), { 
            status: 404,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        return new Response(pdfObject.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": pdfObject.httpMetadata?.contentDisposition || "attachment",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to retrieve PDF",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }
  },

  // Handler for DELETE /pdf/{id}
  async handleDeletePdf(req, env, pathname) {
    // Check admin authentication
    const authResponse = await this.requireAuthentication(req, env);
    if (authResponse.error) return authResponse.error;

    const pdfId = pathname.split("/")[2];
    
    try {
      // Delete from R2
      const pdfKey = `pdfs/${pdfId}.pdf`;
      await env.loresmith_pdfs.delete(pdfKey);
      
      // Delete metadata from KV
      await env.PDF_METADATA.delete(`pdf:${pdfId}`);

      return new Response(JSON.stringify({
        success: true,
        message: "PDF deleted successfully"
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "Failed to delete PDF",
        details: error.message
      }), { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  // Default handler
  async handleDefault() {
    return new Response("LoreSmith PDF Storage Agent Ready\n\nEndpoints:\n- GET /.well-known/agent.json - Agent capabilities\n- POST /validate-key - Validate API key\n- POST /upload/request - Request presigned upload URL (up to 200MB)\n- POST /upload/complete - Complete presigned upload\n- POST /upload - Upload PDF directly (<95MB)\n- GET /pdfs - List PDFs (AUTH REQUIRED)\n- GET /pdf/{id} - Download PDF (AUTH REQUIRED)\n- GET /pdf/{id}/metadata - Get PDF metadata (AUTH REQUIRED)\n- DELETE /pdf/{id} - Delete PDF (ADMIN AUTH REQUIRED)\n\nAuthentication: Bearer token in Authorization header", {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Helper function to require authentication and return appropriate responses
  async requireAuthentication(req, env, adminRequired = false) {
    const authResult = await this.checkAuthentication(req, env, adminRequired);
    
    if (!authResult.success) {
      const errorMessage = adminRequired 
        ? "Delete operations require admin authentication"
        : "I need your API key to access your PDF library. Please provide your authentication credentials.";
      
      const authPrompt = adminRequired
        ? "This operation requires admin privileges. Please provide your admin API key."
        : "To access your PDF library, I need your API key. You can find this in your account settings.";
        
      return {
        error: new Response(JSON.stringify({
          error: "Authentication required",
          message: errorMessage,
          authPrompt: authPrompt,
          authFields: [
            {
              id: 'apiKey',
              type: 'password',
              label: adminRequired ? 'Admin API Key' : 'API Key',
              placeholder: 'Enter your API key',
              required: true,
              description: adminRequired 
                ? 'Admin key required for delete operations'
                : 'Your personal API key for PDF access'
            }
          ],
          conversational: true,
          agent: "pdf-agent"
        }), { 
          status: 401,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "WWW-Authenticate": "Bearer"
          }
        })
      };
    }

    return { success: authResult };
  },

  // Authentication check
  async checkAuthentication(req, env, adminRequired = false, providedApiKey = null) {
    let token;
    
    if (providedApiKey) {
      // Use the provided API key directly (for validation endpoint)
      token = providedApiKey;
    } else {
      // Extract from Authorization header (normal flow)
      const authHeader = req.headers.get("Authorization");
      
      // Log authentication attempt
      console.log("=== PDF AGENT AUTH DEBUG ===");
      console.log("Auth header:", authHeader ? `${authHeader.substring(0, 20)}...` : "MISSING");
      console.log("Admin required:", adminRequired);
      
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("AUTH FAIL: Missing or invalid Authorization header");
        return { success: false, error: "Missing or invalid Authorization header" };
      }

      token = authHeader.slice(7); // Remove "Bearer "
    }
    
    // Check against API keys
    const validApiKey = env.API_KEY;
    const validAdminKey = env.ADMIN_KEY;
    
    // Log expected keys (first 8 chars only for security)
    console.log("Expected API_KEY:", validApiKey ? `${validApiKey.substring(0, 8)}...` : "NOT SET");
    console.log("Expected ADMIN_KEY:", validAdminKey ? `${validAdminKey.substring(0, 8)}...` : "NOT SET");
    console.log("Received token:", token ? `${token.substring(0, 8)}...` : "EMPTY");

    if (adminRequired) {
      console.log("Checking admin key...");
      if (token === validAdminKey) {
        console.log("AUTH SUCCESS: Admin key matched");
        return { success: true, clientId: "admin", isAdmin: true };
      }
      console.log("AUTH FAIL: Admin key required but not matched");
      return { success: false, error: "Admin authentication required" };
    }

    console.log("Checking regular API key...");
    if (token === validApiKey || token === validAdminKey) {
      const isAdmin = token === validAdminKey;
      console.log(`AUTH SUCCESS: ${isAdmin ? 'Admin' : 'User'} key matched`);
      return { 
        success: true, 
        clientId: isAdmin ? "admin" : "user",
        isAdmin: isAdmin
      };
    }

    console.log("AUTH FAIL: No key matched");
    console.log("=== END AUTH DEBUG ===");
    return { success: false, error: "Invalid API key" };
  },

  // Rate limiting
  async checkRateLimit(req, env, clientId) {
    const now = Date.now();
    const hourKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60))}`;
    const dayKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60 * 24))}`;
    
    const hourlyLimit = parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10");
    const dailyLimit = parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50");

    try {
      const [hourlyCount, dailyCount] = await Promise.all([
        env.PDF_METADATA.get(hourKey),
        env.PDF_METADATA.get(dayKey)
      ]);

      const currentHourly = parseInt(hourlyCount || "0");
      const currentDaily = parseInt(dailyCount || "0");

      if (currentHourly >= hourlyLimit) {
        return { 
          success: false, 
          message: `Hourly upload limit of ${hourlyLimit} exceeded`,
          retryAfter: 3600 // 1 hour
        };
      }

      if (currentDaily >= dailyLimit) {
        return { 
          success: false, 
          message: `Daily upload limit of ${dailyLimit} exceeded`,
          retryAfter: 86400 // 24 hours
        };
      }

      return { success: true };
    } catch (error) {
      // If rate limiting fails, allow the request but log it
      console.error("Rate limiting check failed:", error);
      return { success: true };
    }
  },

  // Update rate limit counters
  async updateRateLimit(env, clientId) {
    const now = Date.now();
    const hourKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60))}`;
    const dayKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60 * 24))}`;

    try {
      const [hourlyCount, dailyCount] = await Promise.all([
        env.PDF_METADATA.get(hourKey),
        env.PDF_METADATA.get(dayKey)
      ]);

      await Promise.all([
        env.PDF_METADATA.put(hourKey, (parseInt(hourlyCount || "0") + 1).toString(), { expirationTtl: 3600 }),
        env.PDF_METADATA.put(dayKey, (parseInt(dailyCount || "0") + 1).toString(), { expirationTtl: 86400 })
      ]);
    } catch (error) {
      console.error("Failed to update rate limits:", error);
    }
  },

  // Simple text extraction for preview (basic implementation)
  async extractTextPreview(pdfBuffer) {
    try {
      // This is a very basic implementation - in production you'd want to use a proper PDF parser
      // For now, we'll just return a placeholder since PDF text extraction requires additional libraries
      const uint8Array = new Uint8Array(pdfBuffer);
      const text = new TextDecoder().decode(uint8Array.slice(0, 1000));
      
      // Extract any readable text (very basic)
      const readableText = text.replace(/[^\x20-\x7E]/g, '').trim();
      return readableText.length > 10 ? readableText.substring(0, 200) + "..." : "PDF content detected but text extraction requires additional processing";
      
    } catch (error) {
      return "Text extraction failed - PDF uploaded successfully";
    }
  },


};
  