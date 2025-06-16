export default {
  "schema_version": "1.0.0",
  "agent_name": "LoreSmith PDF Storage Agent",
  "agent_id": "pdf-storage",
  "ui_components": {
    "authentication": {
      "type": "form",
      "title": "🔐 Authentication",
      "description": "Required to access PDF storage and management features",
      "fields": [
        {
          "id": "pdfApiKey",
          "type": "password",
          "label": "API Key",
          "placeholder": "Enter your API key",
          "required": true,
          "validation": {
            "min_length": 1,
            "error_message": "API key is required"
          }
        }
      ],
      "actions": [
        {
          "id": "validateApiKey",
          "type": "submit",
          "label": "Connect",
          "endpoint": "/pdfs",
          "method": "GET",
          "success_action": "show_main_content"
        }
      ]
    },
    "pdf_library": {
      "type": "data_list",
      "title": "📚 Your PDF Library",
      "description": "Manage your uploaded PDFs",
      "data_source": {
        "endpoint": "/pdfs",
        "method": "GET",
        "requires_auth": true
      },
      "actions": [
        {
          "id": "refresh",
          "type": "button",
          "label": "Refresh",
          "style": "secondary",
          "size": "small",
          "action": "refresh_data"
        },
        {
          "id": "changeApiKey",
          "type": "button", 
          "label": "Change API Key",
          "style": "secondary",
          "size": "small",
          "action": "show_authentication"
        }
      ],
      "item_template": {
        "title_field": "name",
        "subtitle_fields": [
          {
            "label": "Size",
            "field": "size",
            "formatter": "file_size"
          },
          {
            "label": "Uploaded",
            "field": "uploaded_at",
            "formatter": "date"
          },
          {
            "label": "Tags",
            "field": "tags",
            "fallback": "No tags"
          }
        ],
        "actions": [
          {
            "id": "download",
            "type": "button",
            "label": "Download",
            "style": "primary",
            "size": "small",
            "endpoint": "/pdf/{id}",
            "method": "GET",
            "action": "download_file"
          },
          {
            "id": "info",
            "type": "button",
            "label": "Info",
            "style": "secondary", 
            "size": "small",
            "endpoint": "/pdf/{id}/info",
            "method": "GET",
            "action": "show_modal"
          },
          {
            "id": "delete",
            "type": "button",
            "label": "Delete",
            "style": "danger",
            "size": "small",
            "endpoint": "/pdf/{id}",
            "method": "DELETE",
            "confirmation": {
              "message": "Are you sure you want to delete \"{name}\"? This action cannot be undone.",
              "confirm_label": "Delete",
              "cancel_label": "Cancel"
            },
            "success_action": "refresh_data"
          }
        ]
      },
      "empty_state": {
        "message": "No PDFs found. Upload your first PDF to get started!",
        "icon": "📄"
      }
    },
    "pdf_upload": {
      "type": "form",
      "title": "📤 Upload New PDF",
      "description": "Upload a new PDF file to your library",
      "endpoint": "/upload",
      "method": "POST",
      "encoding": "multipart/form-data",
      "requires_auth": true,
      "fields": [
        {
          "id": "pdfFileInput",
          "type": "file",
          "label": "Select PDF File",
          "accept": ".pdf",
          "required": true,
          "validation": {
            "max_size": "200MB",
            "allowed_types": ["application/pdf"],
            "error_messages": {
              "invalid_type": "Please select a PDF file",
              "too_large": "File size exceeds 200MB limit"
            }
          },
          "preview": {
            "show_details": true,
            "fields": ["name", "size", "type", "lastModified"]
          }
        },
        {
          "id": "pdfName",
          "type": "text",
          "label": "Display Name (optional)",
          "placeholder": "Custom name for your PDF",
          "description": "Leave blank to use the original filename",
          "auto_populate": {
            "source": "pdfFileInput",
            "transform": "filename_without_extension"
          }
        },
        {
          "id": "pdfTags",
          "type": "text",
          "label": "Tags (optional)",
          "placeholder": "e.g., campaign, rules, homebrew",
          "description": "Comma-separated tags to help organize your PDFs"
        }
      ],
      "actions": [
        {
          "id": "upload",
          "type": "submit",
          "label": "Upload PDF",
          "style": "success",
          "disabled_until": "file_selected",
          "progress": {
            "show": true,
            "text_template": "Uploading: {percent}%"
          }
        },
        {
          "id": "clear",
          "type": "button",
          "label": "Clear",
          "style": "secondary",
          "action": "reset_form"
        }
      ],
      "success_action": "refresh_library"
    },
    "pdf_info_modal": {
      "type": "modal",
      "title": "📄 {name}",
      "size": "large",
      "data_source": {
        "endpoint": "/pdf/{id}/info",
        "method": "GET",
        "requires_auth": true
      },
      "sections": [
        {
          "type": "info_grid",
          "fields": [
            {
              "label": "Filename",
              "field": "filename"
            },
            {
              "label": "Size", 
              "field": "size",
              "formatter": "file_size"
            },
            {
              "label": "Uploaded",
              "field": "uploaded_at",
              "formatter": "datetime"
            },
            {
              "label": "Tags",
              "field": "tags",
              "fallback": "None"
            }
          ]
        },
        {
          "type": "text_preview",
          "title": "📖 Text Preview",
          "field": "text_preview",
          "condition": "field_exists",
          "style": {
            "font_family": "monospace",
            "max_height": "200px",
            "overflow": "auto"
          }
        }
      ],
      "actions": [
        {
          "id": "download",
          "type": "button",
          "label": "Download",
          "style": "primary",
          "endpoint": "/pdf/{id}",
          "method": "GET",
          "action": "download_file"
        },
        {
          "id": "close",
          "type": "button",
          "label": "Close",
          "style": "secondary",
          "action": "close_modal"
        }
      ]
    }
  },
  "layouts": {
    "main": {
      "type": "single_column",
      "max_width": "1200px",
      "components": [
        {
          "component": "authentication",
          "show_when": "not_authenticated"
        },
        {
          "component": "pdf_library",
          "show_when": "authenticated"
        },
        {
          "component": "pdf_upload", 
          "show_when": "authenticated"
        }
      ]
    }
  },
  "endpoints": {
    "/": {
      "layout": "main",
      "title": "LoreSmith PDF Storage Agent"
    },
    "/ui": {
      "layout": "main", 
      "title": "PDF Library Manager"
    }
  },
  "styling": {
    "theme": "modern",
    "color_scheme": {
      "primary": "#3b82f6",
      "secondary": "#6b7280", 
      "success": "#10b981",
      "danger": "#ef4444",
      "background": "#ffffff",
      "surface": "#f9fafb"
    },
    "typography": {
      "font_family": "system-ui, -apple-system, sans-serif",
      "heading_sizes": {
        "h1": "2rem",
        "h2": "1.5rem", 
        "h3": "1.25rem"
      }
    },
    "spacing": {
      "section_margin": "24px",
      "element_padding": "16px",
      "button_padding": "10px 20px"
    }
  },
  "behaviors": {
    "authentication": {
      "storage_key": "loresmith_pdf_api_key",
      "auto_validate": true,
      "remember_key": true
    },
    "file_upload": {
      "show_progress": true,
      "auto_clear_on_success": true,
      "refresh_library_on_success": true
    },
    "error_handling": {
      "show_user_friendly_messages": true,
      "auto_hide_success_after": 3000,
      "retry_failed_requests": false
    }
  }
}; 