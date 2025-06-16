export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return this.handleAgentCard();
    }

    // Serve the upload UI for root path
    if (pathname === "/" || pathname === "/ui") {
      return new Response(this.getUploadUI(), {
        headers: { 
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Serve UI chunks for main agent integration
    if (pathname === "/ui-chunk" && req.method === "GET") {
      return this.handleUIChunk(req);
    }

    // Serve complete UI for main agent integration
    if (pathname === "/ui" && req.method === "GET") {
      return this.handleCompleteUI(req);
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

  // Handler for /.well-known/agent.json
  async handleAgentCard() {
    return new Response(JSON.stringify({
      "@type": "AgentCard",
      "name": "LoreSmith PDF Storage Agent",
      "description": "Stores and manages D&D 5e PDFs for campaign planning. Handles large PDF uploads up to 200MB, extracts metadata, and provides retrieval endpoints.",
      "version": "1.0.0",
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
    return new Response("LoreSmith PDF Storage Agent Ready\n\nEndpoints:\n- GET /.well-known/agent.json - Agent capabilities\n- POST /upload/request - Request presigned upload URL (up to 200MB)\n- POST /upload/complete - Complete presigned upload\n- POST /upload - Upload PDF directly (<95MB)\n- GET /pdfs - List PDFs (AUTH REQUIRED)\n- GET /pdf/{id} - Download PDF (AUTH REQUIRED)\n- GET /pdf/{id}/metadata - Get PDF metadata (AUTH REQUIRED)\n- DELETE /pdf/{id} - Delete PDF (ADMIN AUTH REQUIRED)\n\nAuthentication: Bearer token in Authorization header", {
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
        : "Please provide a valid API key in the Authorization header";
        
      return {
        error: new Response(JSON.stringify({
          error: "Authentication required",
          message: errorMessage,
          format: "Authorization: Bearer your-api-key"
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
  async checkAuthentication(req, env, adminRequired = false) {
    const authHeader = req.headers.get("Authorization");
    
    // Log authentication attempt
    console.log("=== PDF AGENT AUTH DEBUG ===");
    console.log("Auth header:", authHeader ? `${authHeader.substring(0, 20)}...` : "MISSING");
    console.log("Admin required:", adminRequired);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("AUTH FAIL: Missing or invalid Authorization header");
      return { success: false, error: "Missing or invalid Authorization header" };
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    
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

  // Load and serve the upload UI HTML from template
  getUploadUI() {
    // Return the same complete UI as handleCompleteUI but as a full HTML page
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📚 PDF Library Manager</title>
</head>
<body>
    ${this.getCompleteUIContent()}
</body>
</html>`;
  },

  // Get the complete UI content (shared between handleCompleteUI and getUploadUI)
  getCompleteUIContent() {
    return `
      <div class="pdf-agent-ui">
        <style>
          .pdf-agent-ui {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            font-family: system-ui, -apple-system, sans-serif;
          }
          
          .pdf-section {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border: 1px solid #e1e5e9;
          }
          
          .pdf-section h3 {
            margin: 0 0 16px 0;
            color: #1a1a1a;
            font-size: 1.25rem;
            font-weight: 600;
          }
          
          .pdf-input-group {
            margin-bottom: 16px;
          }
          
          .pdf-input-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #374151;
          }
          
          .pdf-input-group input, .pdf-input-group select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.2s;
          }
          
          .pdf-input-group input:focus, .pdf-input-group select:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }
          
          .pdf-input-group small {
            display: block;
            margin-top: 4px;
            color: #6b7280;
            font-size: 12px;
          }
          
          .pdf-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-right: 8px;
            margin-bottom: 8px;
          }
          
          .pdf-btn:hover {
            background: #2563eb;
          }
          
          .pdf-btn:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }
          
          .pdf-btn-secondary {
            background: #6b7280;
          }
          
          .pdf-btn-secondary:hover {
            background: #4b5563;
          }
          
          .pdf-btn-success {
            background: #10b981;
          }
          
          .pdf-btn-success:hover {
            background: #059669;
          }
          
          .pdf-btn-danger {
            background: #ef4444;
          }
          
          .pdf-btn-danger:hover {
            background: #dc2626;
          }
          
          .pdf-btn-sm {
            padding: 6px 12px;
            font-size: 12px;
          }
          
          .pdf-status {
            padding: 12px 16px;
            border-radius: 6px;
            margin: 16px 0;
            font-size: 14px;
            display: none;
          }
          
          .pdf-status.success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #a7f3d0;
          }
          
          .pdf-status.error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
          }
          
          .pdf-status.info {
            background: #dbeafe;
            color: #1e40af;
            border: 1px solid #93c5fd;
          }
          
          .pdf-progress-container {
            margin: 16px 0;
            display: none;
          }
          
          .pdf-progress-bar {
            width: 100%;
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
          }
          
          .pdf-progress-fill {
            height: 100%;
            background: #3b82f6;
            width: 0%;
            transition: width 0.3s ease;
          }
          
          .pdf-progress-text {
            margin-top: 8px;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
          }
          
          .pdf-file-preview {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
            display: none;
          }
          
          .pdf-file-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
          }
          
          .pdf-file-info > div {
            font-size: 14px;
          }
          
          .pdf-file-info strong {
            color: #374151;
          }
          
          .pdf-library {
            margin-top: 24px;
          }
          
          .pdf-library-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
          }
          
          .pdf-container {
            min-height: 100px;
            padding: 20px;
            text-align: center;
            color: #6b7280;
          }
          
          .pdf-item {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            transition: border-color 0.2s;
          }
          
          .pdf-item:hover {
            border-color: #d1d5db;
          }
          
          .pdf-item h4 {
            margin: 0 0 8px 0;
            color: #1f2937;
            font-size: 16px;
          }
          
          .pdf-meta {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 12px;
          }
          
          .pdf-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          
          .pdf-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          
          .pdf-modal {
            background: white;
            border-radius: 12px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          }
          
          .pdf-modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .pdf-modal-header h3 {
            margin: 0;
            color: #1f2937;
          }
          
          .close-modal {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
          }
          
          .close-modal:hover {
            background: #f3f4f6;
            color: #374151;
          }
          
          .pdf-modal-content {
            padding: 24px;
          }
          
          .pdf-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
          }
          
          .pdf-info-grid > div {
            font-size: 14px;
            padding: 12px;
            background: #f9fafb;
            border-radius: 6px;
          }
          
          .pdf-text-preview {
            margin-top: 20px;
          }
          
          .pdf-text-preview h4 {
            margin: 0 0 12px 0;
            color: #374151;
          }
          
          .text-preview-content {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 16px;
            font-family: monospace;
            font-size: 13px;
            line-height: 1.5;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre-wrap;
          }
          
          .pdf-modal-actions {
            padding: 20px 24px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
          }
        </style>
        
        <!-- Authentication Section -->
        <div class="pdf-section" id="pdfApiKeySection">
          <h3>🔐 Authentication</h3>
          <div class="pdf-input-group">
            <label for="pdfApiKey">API Key</label>
            <input type="password" id="pdfApiKey" placeholder="Enter your API key">
            <small>Required to access PDF storage and management features</small>
          </div>
          <button class="pdf-btn" onclick="validatePdfApiKey()">Connect</button>
        </div>
        
        <!-- Main Content (hidden until authenticated) -->
        <div id="pdfMainContent" style="display: none;">
          
          <!-- Library Section -->
          <div class="pdf-section">
            <h3>📚 Your PDF Library</h3>
            <div class="pdf-library-actions">
              <button class="pdf-btn pdf-btn-secondary pdf-btn-sm" onclick="refreshPdfs()">Refresh</button>
              <button class="pdf-btn pdf-btn-secondary pdf-btn-sm" onclick="showApiKeySection()">Change API Key</button>
            </div>
            <div id="pdfContainer" class="pdf-container">Loading...</div>
          </div>
          
          <!-- Upload Section -->
          <div class="pdf-section">
            <h3>📤 Upload New PDF</h3>
            <form id="pdfUploadForm" onsubmit="handlePdfUpload(event)">
              <div class="pdf-input-group">
                <label for="pdfFileInput">Select PDF File</label>
                <input type="file" id="pdfFileInput" accept=".pdf" required onchange="handleFileSelection()">
                <small>Supports PDF files up to 200MB</small>
              </div>
              
              <div id="pdfFilePreview" class="pdf-file-preview">
                <h4>📄 Selected File</h4>
                <div id="pdfFileDetails" class="pdf-file-info"></div>
              </div>
              
              <div class="pdf-input-group">
                <label for="pdfName">Display Name (optional)</label>
                <input type="text" id="pdfName" placeholder="Custom name for your PDF">
                <small>Leave blank to use the original filename</small>
              </div>
              
              <div class="pdf-input-group">
                <label for="pdfTags">Tags (optional)</label>
                <input type="text" id="pdfTags" placeholder="e.g., campaign, rules, homebrew">
                <small>Comma-separated tags to help organize your PDFs</small>
              </div>
              
              <div class="pdf-actions">
                <button type="submit" class="pdf-btn pdf-btn-success" id="pdfUploadBtn" disabled>
                  <span id="pdfUploadBtnText">Upload PDF</span>
                </button>
                <button type="button" class="pdf-btn pdf-btn-secondary" onclick="clearUploadForm()">Clear</button>
              </div>
              
              <div class="pdf-progress-container" id="pdfUploadProgress">
                <div class="pdf-progress-bar">
                  <div class="pdf-progress-fill" id="pdfProgressFill"></div>
                </div>
                <div class="pdf-progress-text" id="pdfProgressText">Preparing upload...</div>
              </div>
              
              <div id="pdfUploadStatus" class="pdf-status"></div>
            </form>
          </div>
          
        </div>
        
        <div id="pdfStatus" class="pdf-status"></div>
      </div>
      
      <script>
        ${this.getPdfAgentScripts()}
      </script>
    `;
  },

  // Handle UI chunk requests for main agent integration
  async handleCompleteUI(req) {
    const step = new URL(req.url).searchParams.get('step') || '1';
    
    // Return complete HTML interface for PDF management using shared content
    const completeUI = this.getCompleteUIContent();

    return new Response(completeUI, {
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },

  async handleUIChunk(req) {
    const url = new URL(req.url);
    const step = url.searchParams.get('step') || '1';
    
    // Return a comprehensive PDF management interface
    const uiChunk = {
      success: true,
      title: '📚 PDF Library Manager',
      html: `
        <div class="agent-ui-chunk">
          <div class="prompt">
            <h3>📚 PDF Library Manager</h3>
            <p>Manage your PDF collection with secure upload and organization features.</p>
          </div>
          
          <!-- API Key Section -->
          <div class="section" id="apiKeySection">
            <h4>🔐 Authentication</h4>
            <div class="input-group">
              <label for="pdfApiKey">API Key</label>
              <input type="password" id="pdfApiKey" placeholder="Enter your API key">
              <button class="btn btn-sm" onclick="validatePdfApiKey()">Connect</button>
            </div>
          </div>
          
          <!-- Main Content (hidden until authenticated) -->
          <div id="mainContent" style="display: none;">
            
            <!-- Library Section -->
            <div class="section">
              <h4>📚 Your PDF Library</h4>
              <div id="pdfsContainer" class="pdfs-container">Loading...</div>
              <div class="library-actions">
                <button class="btn btn-secondary btn-sm" onclick="refreshPdfs()">Refresh</button>
                <button class="btn btn-secondary btn-sm" onclick="showApiKeySection()">Change API Key</button>
              </div>
            </div>
            
            <!-- Upload Section -->
            <div class="section">
              <h4>📤 Upload New PDF</h4>
              <form id="pdfUploadForm" onsubmit="handlePdfUpload(event)">
                <div class="input-group">
                  <label for="pdfFileInput">Select PDF File</label>
                  <input type="file" id="pdfFileInput" accept=".pdf" required onchange="handleFileSelection()">
                  <small>Supports PDF files up to 200MB</small>
                </div>
                
                <div id="filePreview" class="file-preview" style="display: none;">
                  <h5>📄 Selected File</h5>
                  <div id="fileDetails" class="file-details"></div>
                </div>
                
                <div class="input-group">
                  <label for="pdfName">Display Name (optional)</label>
                  <input type="text" id="pdfName" placeholder="Custom name for your PDF">
                  <small>Leave blank to use the original filename</small>
                </div>
                
                <div class="input-group">
                  <label for="pdfTags">Tags (optional)</label>
                  <input type="text" id="pdfTags" placeholder="e.g., campaign, rules, homebrew">
                  <small>Comma-separated tags to help organize your PDFs</small>
                </div>
                
                <div class="upload-actions">
                  <button type="submit" class="btn btn-success" id="uploadBtn" disabled>
                    <span id="uploadBtnText">Upload PDF</span>
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="clearUploadForm()">Clear</button>
                </div>
                
                <div class="progress-container" id="uploadProgress" style="display: none;">
                  <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                  </div>
                  <div class="progress-text" id="progressText">Preparing upload...</div>
                </div>
                
                <div id="uploadStatus" class="status-message"></div>
              </form>
            </div>
            
          </div>
        </div>
      `,
      scripts: this.getPdfAgentScripts()
    };

    return new Response(JSON.stringify(uiChunk), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },

  // Get PDF agent JavaScript functions for UI chunks
  getPdfAgentScripts() {
    return `
      let currentPdfFile = null;
      let pdfApiKey = localStorage.getItem('loresmith_pdf_api_key') || '';
      
      // Initialize the interface
      document.addEventListener('DOMContentLoaded', function() {
        initializePdfAgent();
      });
      
      function initializePdfAgent() {
        // Auto-populate API key if stored
        const apiKeyInput = document.getElementById('pdfApiKey');
        if (apiKeyInput && pdfApiKey) {
          apiKeyInput.value = pdfApiKey;
          // Auto-validate if we have a stored key
          setTimeout(validatePdfApiKey, 100);
        }
      }
      
      async function validatePdfApiKey() {
        const apiKeyInput = document.getElementById('pdfApiKey');
        pdfApiKey = apiKeyInput.value.trim();
        
        if (!pdfApiKey) {
          showAgentStatus('Please enter your API key', 'error');
          return;
        }
        
        localStorage.setItem('loresmith_pdf_api_key', pdfApiKey);
        
        try {
          showAgentStatus('Validating API key...', 'info');
          const response = await fetch('./pdfs', {
            headers: { 'Authorization': 'Bearer ' + pdfApiKey }
          });
          
          if (response.ok) {
            hideAgentStatus();
            showMainContent();
            setTimeout(refreshPdfs, 100);
          } else {
            showAgentStatus('Invalid API key. Please check and try again.', 'error');
          }
        } catch (error) {
          showAgentStatus('Error validating API key: ' + error.message, 'error');
        }
      }
      
      function showMainContent() {
        const apiKeySection = document.getElementById('apiKeySection');
        const mainContent = document.getElementById('mainContent');
        
        if (apiKeySection) apiKeySection.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
      }
      
      function showApiKeySection() {
        const apiKeySection = document.getElementById('apiKeySection');
        const mainContent = document.getElementById('mainContent');
        
        if (apiKeySection) apiKeySection.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
        
        // Clear the API key field for security
        const apiKeyInput = document.getElementById('pdfApiKey');
        if (apiKeyInput) apiKeyInput.value = '';
        pdfApiKey = '';
        localStorage.removeItem('loresmith_pdf_api_key');
      }
      
      async function refreshPdfs() {
        const container = document.getElementById('pdfsContainer');
        if (!container) return;
        
        container.innerHTML = 'Loading...';
        
        try {
          const response = await fetch('./pdfs', {
            headers: { 'Authorization': 'Bearer ' + pdfApiKey }
          });
          
          const data = await response.json();
          
          // Handle the new response format with pdfs array and message
          if (data.pdfs !== undefined) {
            if (data.pdfs.length === 0) {
              // Use the message from the server if available
              const message = data.message || 'No PDFs found. Upload your first PDF to get started!';
              container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">' + message + '</p>';
              
              // Show debug info if available
              if (data.debug) {
                console.log('PDF Agent Debug:', data.debug);
              }
            } else {
              let html = '';
              data.pdfs.forEach(pdf => {
                html += '<div class="pdf-item">';
                html += '<h4>' + (pdf.name || pdf.filename) + '</h4>';
                html += '<div class="pdf-meta">';
                html += 'Size: ' + formatFileSize(pdf.size) + ' | ';
                html += 'Uploaded: ' + new Date(pdf.uploaded_at).toLocaleDateString() + ' | ';
                html += (pdf.tags ? 'Tags: ' + pdf.tags : 'No tags');
                html += '</div>';
                html += '<div class="pdf-actions">';
                html += '<button class="btn btn-sm" onclick="downloadPDF(\\'' + pdf.id + '\\', \\'' + pdf.filename + '\\')">Download</button>';
                html += '<button class="btn btn-sm btn-secondary" onclick="viewPDFInfo(\\'' + pdf.id + '\\')">Info</button>';
                html += '<button class="btn btn-sm btn-danger" onclick="deletePDF(\\'' + pdf.id + '\\', \\'' + (pdf.name || pdf.filename) + '\\')">Delete</button>';
                html += '</div>';
                html += '</div>';
              });
              container.innerHTML = html;
            }
          } else {
            // Handle old format or error responses
            throw new Error(data.error || data.message || 'Unexpected response format');
          }
        } catch (error) {
          container.innerHTML = '<p style="color: #dc3545;">Error loading PDFs: ' + error.message + '</p>';
        }
      }
      
      function handleFileSelection() {
        const fileInput = document.getElementById('pdfFileInput');
        const file = fileInput.files[0];
        const filePreview = document.getElementById('filePreview');
        const fileDetails = document.getElementById('fileDetails');
        const uploadBtn = document.getElementById('uploadBtn');
        const pdfNameInput = document.getElementById('pdfName');
        
        if (!file) {
          if (filePreview) filePreview.style.display = 'none';
          if (uploadBtn) uploadBtn.disabled = true;
          currentPdfFile = null;
          return;
        }
        
        if (file.type !== 'application/pdf') {
          showAgentStatus('Please select a PDF file', 'error');
          fileInput.value = '';
          return;
        }
        
        if (file.size > 200 * 1024 * 1024) {
          showAgentStatus('File size exceeds 200MB limit', 'error');
          fileInput.value = '';
          return;
        }
        
        currentPdfFile = file;
        
        // Show file details
        if (fileDetails) {
          fileDetails.innerHTML = \`
            <div class="file-info">
              <div><strong>Name:</strong> \${file.name}</div>
              <div><strong>Size:</strong> \${formatFileSize(file.size)}</div>
              <div><strong>Type:</strong> \${file.type}</div>
              <div><strong>Modified:</strong> \${new Date(file.lastModified).toLocaleDateString()}</div>
            </div>
          \`;
        }
        
        // Auto-populate name field with filename (without extension)
        if (pdfNameInput && !pdfNameInput.value) {
          const nameWithoutExt = file.name.replace(/\\.pdf$/i, '');
          pdfNameInput.value = nameWithoutExt;
        }
        
        if (filePreview) filePreview.style.display = 'block';
        if (uploadBtn) uploadBtn.disabled = false;
        
        hideAgentStatus();
      }
      
      function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      function clearUploadForm() {
        const form = document.getElementById('pdfUploadForm');
        const filePreview = document.getElementById('filePreview');
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadProgress = document.getElementById('uploadProgress');
        const uploadStatus = document.getElementById('uploadStatus');
        
        if (form) form.reset();
        if (filePreview) filePreview.style.display = 'none';
        if (uploadBtn) uploadBtn.disabled = true;
        if (uploadProgress) uploadProgress.style.display = 'none';
        if (uploadStatus) uploadStatus.innerHTML = '';
        
        currentPdfFile = null;
        hideAgentStatus();
      }
      
      async function handlePdfUpload(event) {
        event.preventDefault();
        
        if (!currentPdfFile) {
          showAgentStatus('Please select a file first', 'error');
          return;
        }
        
        if (!pdfApiKey) {
          showAgentStatus('API key required', 'error');
          return;
        }
        
        const formData = new FormData();
        const nameInput = document.getElementById('pdfName');
        const tagsInput = document.getElementById('pdfTags');
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadBtnText = document.getElementById('uploadBtnText');
        const uploadProgress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const uploadStatus = document.getElementById('uploadStatus');
        
        // Prepare form data
        formData.append('file', currentPdfFile);
        if (nameInput && nameInput.value.trim()) {
          formData.append('name', nameInput.value.trim());
        }
        if (tagsInput && tagsInput.value.trim()) {
          formData.append('tags', tagsInput.value.trim());
        }
        
        // Update UI for upload
        if (uploadBtn) uploadBtn.disabled = true;
        if (uploadBtnText) uploadBtnText.textContent = 'Uploading...';
        if (uploadProgress) uploadProgress.style.display = 'block';
        if (progressText) progressText.textContent = 'Preparing upload...';
        
        try {
          const response = await fetch('./upload', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + pdfApiKey
            },
            body: formData
          });
          
          const result = await response.json();
          
          if (response.ok && result.success) {
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = 'Upload complete!';
            if (uploadStatus) {
              uploadStatus.innerHTML = '<div style="color: #28a745;">✅ PDF uploaded successfully!</div>';
            }
            
            // Clear form and refresh library
            setTimeout(() => {
              clearUploadForm();
              refreshPdfs();
            }, 2000);
            
          } else {
            throw new Error(result.error || result.message || 'Upload failed');
          }
          
        } catch (error) {
          if (uploadStatus) {
            uploadStatus.innerHTML = '<div style="color: #dc3545;">❌ Upload failed: ' + error.message + '</div>';
          }
          showAgentStatus('Upload failed: ' + error.message, 'error');
        } finally {
          // Reset upload button
          if (uploadBtn) uploadBtn.disabled = false;
          if (uploadBtnText) uploadBtnText.textContent = 'Upload PDF';
          
          // Hide progress after delay
          setTimeout(() => {
            if (uploadProgress) uploadProgress.style.display = 'none';
          }, 3000);
        }
      }
      
      // PDF library action functions
      function downloadPDF(pdfId, filename) {
        const url = './pdf/' + pdfId;
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      }
      
      async function viewPDFInfo(pdfId) {
        try {
          showAgentStatus('Loading PDF information...', 'info');
          
          const response = await fetch('./pdf/' + pdfId + '/metadata', {
            headers: {
              'Authorization': 'Bearer ' + pdfApiKey
            }
          });
          
          if (!response.ok) {
            throw new Error('Failed to load PDF information');
          }
          
          const pdfData = await response.json();
          showPDFInfoModal(pdfData);
          hideAgentStatus();
          
        } catch (error) {
          showAgentStatus('Error loading PDF info: ' + error.message, 'error');
        }
      }
      
      async function deletePDF(pdfId, pdfName) {
        if (!confirm('Are you sure you want to delete "' + pdfName + '"? This action cannot be undone.')) {
          return;
        }
        
        try {
          showAgentStatus('Deleting PDF...', 'info');
          
          const response = await fetch('/proxy/pdf-agent/pdf/' + pdfId, {
            method: 'DELETE',
            headers: {
              'Authorization': 'Bearer ' + pdfApiKey
            }
          });
          
          if (response.ok) {
            showAgentStatus('PDF deleted successfully', 'success');
            setTimeout(() => {
              hideAgentStatus();
              refreshPdfs();
            }, 1500);
          } else {
            const result = await response.json();
            throw new Error(result.error || 'Failed to delete PDF');
          }
          
        } catch (error) {
          showAgentStatus('Error deleting PDF: ' + error.message, 'error');
        }
      }
      
      function showPDFInfoModal(pdfData) {
        // Create modal HTML
        const modalHtml = \`
          <div class="pdf-modal-overlay" onclick="closePDFInfoModal()">
            <div class="pdf-modal" onclick="event.stopPropagation()">
              <div class="pdf-modal-header">
                <h3>📄 \${pdfData.name || pdfData.filename}</h3>
                <button class="close-modal" onclick="closePDFInfoModal()">×</button>
              </div>
              <div class="pdf-modal-content">
                <div class="pdf-info-grid">
                  <div><strong>Filename:</strong> \${pdfData.filename}</div>
                  <div><strong>Size:</strong> \${formatFileSize(pdfData.size)}</div>
                  <div><strong>Uploaded:</strong> \${new Date(pdfData.uploaded_at).toLocaleString()}</div>
                  <div><strong>Tags:</strong> \${pdfData.tags || 'None'}</div>
                </div>
                \${pdfData.text_preview ? \`
                  <div class="pdf-text-preview">
                    <h4>Text Preview:</h4>
                    <div class="text-preview-content">\${pdfData.text_preview}</div>
                  </div>
                \` : ''}
              </div>
              <div class="pdf-modal-actions">
                <button class="btn" onclick="downloadPDF('\${pdfData.id}', '\${pdfData.filename}')">Download</button>
                <button class="btn btn-secondary" onclick="closePDFInfoModal()">Close</button>
              </div>
            </div>
          </div>
        \`;
        
        // Add modal to page
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
      }
      
      function closePDFInfoModal() {
        const modal = document.querySelector('.pdf-modal-overlay');
        if (modal) {
          modal.remove();
        }
      }
    `;
  }
};
  