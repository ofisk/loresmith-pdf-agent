export const UPLOAD_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoreSmith PDF Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; padding: 20px;
        }
        .container { 
            max-width: 700px; margin: 0 auto; background: white; 
            border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
            overflow: hidden; 
        }
        .header { 
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); 
            color: white; padding: 30px; text-align: center; 
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 700; }
        .header p { font-size: 1.1em; opacity: 0.9; }
        .content { padding: 40px; }
        
        .step { display: none; }
        .step.active { display: block; }
        
        .prompt { 
            background: #f8f9fa; padding: 25px; border-radius: 15px; 
            margin-bottom: 25px; border-left: 5px solid #3498db;
        }
        .prompt h3 { color: #2c3e50; margin-bottom: 15px; font-size: 1.3em; }
        .prompt p { color: #495057; line-height: 1.6; margin-bottom: 15px; }
        
        .input-group { margin-bottom: 20px; }
        .input-group label { 
            display: block; margin-bottom: 8px; font-weight: 600; 
            color: #2c3e50; font-size: 1.1em;
        }
        .input-group input, .input-group textarea { 
            width: 100%; padding: 15px; border: 2px solid #ddd; 
            border-radius: 10px; font-size: 16px; transition: border-color 0.3s;
        }
        .input-group input:focus, .input-group textarea:focus { 
            outline: none; border-color: #3498db; 
        }
        .input-group textarea { resize: vertical; min-height: 80px; }
        
        .btn { 
            background: linear-gradient(135deg, #3498db, #2980b9); 
            color: white; border: none; padding: 15px 30px; 
            border-radius: 10px; font-size: 16px; cursor: pointer; 
            transition: transform 0.2s; margin-right: 10px;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        
        .btn-secondary { 
            background: linear-gradient(135deg, #6c757d, #5a6268); 
        }
        
        .btn-success { 
            background: linear-gradient(135deg, #28a745, #218838); 
        }
        
        .btn-danger { 
            background: linear-gradient(135deg, #dc3545, #c82333); 
        }
        
        .pdfs-list { margin: 20px 0; }
        .pdf-item { 
            background: #f8f9fa; padding: 20px; border-radius: 10px; 
            margin-bottom: 15px; border: 1px solid #e9ecef;
        }
        .pdf-item h4 { color: #2c3e50; margin-bottom: 8px; }
        .pdf-item .pdf-meta { 
            color: #6c757d; font-size: 14px; margin-bottom: 10px; 
        }
        .pdf-item .pdf-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .pdf-item .pdf-actions button { 
            padding: 8px 16px; font-size: 14px; border-radius: 6px; 
        }
        
        .file-preview { 
            background: #e8f4f8; padding: 20px; border-radius: 10px; 
            margin: 20px 0; border: 2px solid #17a2b8;
        }
        .file-preview h4 { color: #2c3e50; margin-bottom: 15px; }
        .file-details { 
            display: grid; grid-template-columns: 1fr 1fr; gap: 15px; 
            margin-bottom: 15px;
        }
        .file-detail { 
            background: white; padding: 10px; border-radius: 6px; 
        }
        .file-detail strong { color: #495057; }
        
        .status { 
            padding: 15px; border-radius: 10px; margin: 20px 0; 
            display: none; text-align: center;
        }
        .status.success { 
            background: #d5f4e6; color: #27ae60; border: 2px solid #27ae60; 
        }
        .status.error { 
            background: #f8d7da; color: #721c24; border: 2px solid #f5c6cb; 
        }
        .status.info { 
            background: #cce7ff; color: #0066cc; border: 2px solid #0066cc; 
        }
        
        .progress-bar { 
            width: 100%; height: 25px; background: #e9ecef; 
            border-radius: 15px; overflow: hidden; margin: 20px 0; display: none; 
        }
        .progress-fill { 
            height: 100%; background: linear-gradient(90deg, #27ae60, #2ecc71); 
            width: 0%; transition: width 0.3s; 
        }
        
        .hidden { display: none !important; }
        
        @media (max-width: 600px) { 
            .header h1 { font-size: 2em; } 
            .content { padding: 20px; } 
            .file-details { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎲 LoreSmith PDF Manager</h1>
            <p>Manage your D&D PDFs with ease</p>
        </div>
        <div class="content">
            <!-- Step 1: API Key Entry -->
            <div id="step1" class="step active">
                <div class="prompt">
                    <h3>🔐 Welcome to LoreSmith PDF Manager</h3>
                    <p>To get started, please enter your API key. This will allow you to securely upload, manage, and access your D&D PDFs.</p>
                </div>
                <div class="input-group">
                    <label for="apiKey">API Key</label>
                    <input type="password" id="apiKey" placeholder="Enter your API key">
                </div>
                <button class="btn" onclick="validateApiKey()">Continue</button>
            </div>
            
            <!-- Step 2: List PDFs -->
            <div id="step2" class="step">
                <div class="prompt">
                    <h3>📚 Your PDF Library</h3>
                    <p>Here are your currently stored PDFs. You can download, view details, or delete any of them.</p>
                </div>
                <div id="pdfsList" class="pdfs-list">
                    <div id="pdfsContainer">Loading...</div>
                </div>
                <button class="btn btn-success" onclick="goToStep(3)">Upload New PDF</button>
                <button class="btn btn-secondary" onclick="refreshPDFs()">Refresh List</button>
            </div>
            
            <!-- Step 3: Upload Prompt -->
            <div id="step3" class="step">
                <div class="prompt">
                    <h3>📤 Upload New PDF</h3>
                    <p>Ready to add a new PDF to your library? Let's start by selecting the file you'd like to upload.</p>
                </div>
                <div class="input-group">
                    <label for="fileInput">Choose PDF File</label>
                    <input type="file" id="fileInput" accept=".pdf" onchange="handleFileSelection()">
                </div>
                <button class="btn btn-secondary" onclick="goToStep(2)">Back to Library</button>
            </div>
            
            <!-- Step 4: File Details -->
            <div id="step4" class="step">
                <div class="prompt">
                    <h3>📝 PDF Details</h3>
                    <p>Great! Now let's add some details to help organize your PDF in the library.</p>
                </div>
                <div id="filePreview" class="file-preview">
                    <h4>Selected File:</h4>
                    <div id="fileDetails" class="file-details"></div>
                </div>
                <div class="input-group">
                    <label for="pdfName">PDF Name (optional)</label>
                    <input type="text" id="pdfName" placeholder="Custom name for your PDF">
                    <small style="color: #6c757d;">Leave blank to use the original filename</small>
                </div>
                <div class="input-group">
                    <label for="pdfTags">Tags (optional)</label>
                    <textarea id="pdfTags" placeholder="Add tags separated by commas (e.g., campaign, rules, homebrew, player-guide)"></textarea>
                    <small style="color: #6c757d;">Tags help you organize and find your PDFs later</small>
                </div>
                <button class="btn" onclick="goToStep(5)">Review & Upload</button>
                <button class="btn btn-secondary" onclick="goToStep(3)">Choose Different File</button>
            </div>
            
            <!-- Step 5: Final Confirmation -->
            <div id="step5" class="step">
                <div class="prompt">
                    <h3>✅ Ready to Upload</h3>
                    <p>Please review your upload details below. Once you click "Upload PDF", the file will be processed and added to your library.</p>
                </div>
                <div id="uploadSummary" class="file-preview">
                    <h4>Upload Summary:</h4>
                    <div id="summaryDetails"></div>
                </div>
                <div class="progress-bar" id="progressBar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="status" id="status"></div>
                <div id="uploadActions">
                    <button class="btn btn-success" onclick="uploadFile()">Upload PDF</button>
                    <button class="btn btn-secondary" onclick="goToStep(4)">Edit Details</button>
                    <button class="btn btn-danger" onclick="cancelUpload()">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let currentFile = null;
        let apiKey = localStorage.getItem('loresmith_api_key') || '';
        let currentStep = 1;
        
        document.addEventListener('DOMContentLoaded', function() {
            if (apiKey) {
                document.getElementById('apiKey').value = apiKey;
            }
        });
        
        function goToStep(step) {
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
            document.getElementById('step' + step).classList.add('active');
            currentStep = step;
        }
        
        async function validateApiKey() {
            const apiKeyInput = document.getElementById('apiKey');
            apiKey = apiKeyInput.value.trim();
            
            if (!apiKey) {
                showStatus('Please enter your API key', 'error');
                return;
            }
            
            localStorage.setItem('loresmith_api_key', apiKey);
            
            try {
                showStatus('Validating API key...', 'info');
                const response = await fetch('./pdfs', {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                
                if (response.ok) {
                    hideStatus();
                    goToStep(2);
                    loadPDFs();
                } else {
                    showStatus('Invalid API key. Please check and try again.', 'error');
                }
            } catch (error) {
                showStatus('Error validating API key: ' + error.message, 'error');
            }
        }
        
        async function loadPDFs() {
            const container = document.getElementById('pdfsContainer');
            container.innerHTML = 'Loading...';
            
            try {
                const response = await fetch('./pdfs', {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to load PDFs');
                }
                
                const pdfs = await response.json();
                
                if (pdfs.length === 0) {
                    container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">No PDFs found. Upload your first PDF to get started!</p>';
                } else {
                    let html = '';
                    pdfs.forEach(pdf => {
                        html += '<div class="pdf-item">';
                        html += '<h4>' + (pdf.name || pdf.filename) + '</h4>';
                        html += '<div class="pdf-meta">';
                        html += 'Size: ' + formatFileSize(pdf.size) + ' | ';
                        html += 'Uploaded: ' + new Date(pdf.uploaded_at).toLocaleDateString() + ' | ';
                        html += (pdf.tags ? 'Tags: ' + pdf.tags : 'No tags');
                        html += '</div>';
                        html += '<div class="pdf-actions">';
                        html += '<button class="btn" onclick="downloadPDF(\\'' + pdf.id + '\\', \\'' + pdf.filename + '\\')">Download</button>';
                        html += '<button class="btn btn-secondary" onclick="viewPDFInfo(\\'' + pdf.id + '\\')">View Info</button>';
                        html += '<button class="btn btn-danger" onclick="deletePDF(\\'' + pdf.id + '\\', \\'' + (pdf.name || pdf.filename) + '\\')">Delete</button>';
                        html += '</div>';
                        html += '</div>';
                    });
                    container.innerHTML = html;
                }
            } catch (error) {
                container.innerHTML = '<p style="color: #dc3545;">Error loading PDFs: ' + error.message + '</p>';
            }
        }
        
        function refreshPDFs() {
            loadPDFs();
        }
        
        function handleFileSelection() {
            const fileInput = document.getElementById('fileInput');
            const file = fileInput.files[0];
            
            if (!file) return;
            
            if (file.type !== 'application/pdf') {
                showStatus('Please select a PDF file', 'error');
                return;
            }
            
            if (file.size > 200 * 1024 * 1024) {
                showStatus('File size exceeds 200MB limit', 'error');
                return;
            }
            
            currentFile = file;
            
            const fileDetails = document.getElementById('fileDetails');
            let html = '';
            html += '<div class="file-detail"><strong>Filename:</strong><br>' + file.name + '</div>';
            html += '<div class="file-detail"><strong>Size:</strong><br>' + formatFileSize(file.size) + '</div>';
            html += '<div class="file-detail"><strong>Type:</strong><br>' + file.type + '</div>';
            html += '<div class="file-detail"><strong>Last Modified:</strong><br>' + new Date(file.lastModified).toLocaleDateString() + '</div>';
            fileDetails.innerHTML = html;
            
            const nameWithoutExt = file.name.replace(/\\.pdf$/i, '');
            document.getElementById('pdfName').value = nameWithoutExt;
            
            goToStep(4);
        }
        
        function updateUploadSummary() {
            const name = document.getElementById('pdfName').value.trim() || currentFile.name;
            const tags = document.getElementById('pdfTags').value.trim();
            
            const summaryDetails = document.getElementById('summaryDetails');
            let html = '<div class="file-details">';
            html += '<div class="file-detail"><strong>File:</strong><br>' + currentFile.name + '</div>';
            html += '<div class="file-detail"><strong>Size:</strong><br>' + formatFileSize(currentFile.size) + '</div>';
            html += '<div class="file-detail"><strong>Display Name:</strong><br>' + name + '</div>';
            html += '<div class="file-detail"><strong>Tags:</strong><br>' + (tags || 'None') + '</div>';
            html += '</div>';
            summaryDetails.innerHTML = html;
        }
        
        const originalGoToStep = goToStep;
        goToStep = function(step) {
            if (step === 5 && currentFile) {
                updateUploadSummary();
            }
            originalGoToStep(step);
        };
        
        async function uploadFile() {
            if (!currentFile) return;
            
            const name = document.getElementById('pdfName').value.trim();
            const tags = document.getElementById('pdfTags').value.trim();
            
            document.getElementById('uploadActions').style.display = 'none';
            document.getElementById('progressBar').style.display = 'block';
            
            try {
                if (currentFile.size > 100 * 1024 * 1024) {
                    await uploadLargeFile(currentFile, name, tags);
                } else {
                    await uploadSmallFile(currentFile, name, tags);
                }
                
                showStatus('PDF uploaded successfully!', 'success');
                setTimeout(() => {
                    goToStep(2);
                    loadPDFs();
                    resetUploadForm();
                }, 2000);
                
            } catch (error) {
                showStatus('Upload failed: ' + error.message, 'error');
                document.getElementById('uploadActions').style.display = 'block';
            }
        }
        
        async function uploadSmallFile(file, name, tags) {
            const formData = new FormData();
            formData.append('file', file);
            if (name) formData.append('name', name);
            if (tags) formData.append('tags', tags);
            
            const response = await fetch('./upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey },
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Upload failed');
            }
            
            return response.json();
        }
        
        async function uploadLargeFile(file, name, tags) {
            const requestResponse = await fetch('./upload/request', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: file.name,
                    size: file.size,
                    name: name,
                    tags: tags
                })
            });
            
            if (!requestResponse.ok) {
                const error = await requestResponse.json();
                throw new Error(error.message || 'Failed to request upload URL');
            }
            
            const result = await requestResponse.json();
            const uploadUrl = result.upload_url;
            const uploadId = result.upload_id;
            
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': 'application/pdf' }
            });
            
            if (!uploadResponse.ok) {
                throw new Error('Failed to upload file to storage');
            }
            
            const etag = uploadResponse.headers.get('ETag');
            
            const completeResponse = await fetch('./upload/complete', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    upload_id: uploadId,
                    etag: etag
                })
            });
            
            if (!completeResponse.ok) {
                const error = await completeResponse.json();
                throw new Error(error.message || 'Failed to complete upload');
            }
            
            return completeResponse.json();
        }
        
        function cancelUpload() {
            if (confirm('Are you sure you want to cancel this upload?')) {
                resetUploadForm();
                goToStep(2);
            }
        }
        
        function resetUploadForm() {
            currentFile = null;
            document.getElementById('fileInput').value = '';
            document.getElementById('pdfName').value = '';
            document.getElementById('pdfTags').value = '';
            document.getElementById('progressBar').style.display = 'none';
            document.getElementById('uploadActions').style.display = 'block';
            hideStatus();
        }
        
        async function downloadPDF(id, filename) {
            try {
                const response = await fetch('./pdf/' + id, {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                
                if (!response.ok) throw new Error('Download failed');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (error) {
                alert('Download failed: ' + error.message);
            }
        }
        
        async function viewPDFInfo(id) {
            try {
                const response = await fetch('./pdf/' + id + '/metadata', {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                
                if (!response.ok) throw new Error('Failed to load PDF info');
                
                const info = await response.json();
                let message = 'PDF Info:\\n\\n';
                message += 'Name: ' + (info.name || info.filename) + '\\n';
                message += 'Size: ' + formatFileSize(info.size) + '\\n';
                message += 'Uploaded: ' + new Date(info.uploaded_at).toLocaleString() + '\\n';
                message += 'Tags: ' + (info.tags || 'None') + '\\n\\n';
                message += 'Text Preview:\\n' + (info.text_preview || 'No preview available');
                alert(message);
            } catch (error) {
                alert('Error loading PDF info: ' + error.message);
            }
        }
        
        async function deletePDF(id, name) {
            if (!confirm('Are you sure you want to delete "' + name + '"? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch('./pdf/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Delete failed');
                }
                
                loadPDFs();
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }
        
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        function hideStatus() {
            const status = document.getElementById('status');
            status.style.display = 'none';
        }
    </script>
</body>
</html>`; 